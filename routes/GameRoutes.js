// GameRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types;
const jwt = require('jsonwebtoken');

// JWT 인증 미들웨어 (다른 파일에 있다면 가져와서 사용하세요)
const authMiddleware = (req, res, next) => {
  const token = req.cookies.accessToken;
  if (!token) {
    // AJAX 요청일 경우 JSON으로, 일반 페이지 요청일 경우 리다이렉트
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.status(401).json({ message: '인증이 필요합니다. 로그인해주세요.' });
    }
    return res.status(401).redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // req.user에 사용자 정보 저장
    next();
  } catch (error) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
};

// 세션 정보 조회
router.get('/session/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: '잘못된 세션 ID 형식' });
  }

  const quizDb = req.app.get('quizDb');
  const userDb = req.app.get('userDb');  // User DB 추가
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const User = require('../models/User')(userDb);  // User 모델 추가

  try {
    const session = await GameSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ message: '세션 없음' });

    // 인가 로직: 이 사용자가 해당 세션에 참여할 권한이 있는가?
    const isHost = session.host.toString() === req.user.id;
    const isParticipant = session.players.some(p => p.userId.toString() === req.user.id);

    if (!isHost && !isParticipant) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    // 퀴즈 정보 가져오기
    const quiz = await Quiz.findById(session.quizId).lean();
    if (!quiz) return res.status(404).json({ message: '퀴즈 없음' });

    // 각 플레이어의 최신 프로필 이미지 정보 가져오기
    const playerIds = session.players.map(p => p.userId);
    const users = await User.find({ _id: { $in: playerIds } }).select('_id nickname profileImage').lean();
    
    // 사용자 정보를 ID로 매핑
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    // 플레이어 정보에 최신 프로필 이미지 추가
    const updatedPlayers = session.players.map(player => {
      const userInfo = userMap[player.userId.toString()];
      return {
        ...player,
        profileImage: userInfo?.profileImage || player.profileImage || null,
        nickname: userInfo?.nickname || player.nickname || null
      };
    });

    // correctUsers 처리
    const correctUsers = session.correctUsers || {};
    quiz.questions.forEach((q, i) => {
      q.correctUsers = correctUsers[i] || [];
    });

    // 세션 데이터에 업데이트된 플레이어 정보 포함
    const responseData = {
      ...session,
      players: updatedPlayers,
      quiz: quiz
    };

    res.json(responseData);
  } catch (err) {
    console.error('세션 조회 중 오류:', err);
    res.status(500).json({ message: '세션 조회 실패', error: err.message });
  }
});

// 세션 생성
router.post('/start', authMiddleware, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  const { quizId } = req.body;
  const { id: userId, username } = req.user;

  if (!ObjectId.isValid(quizId)) {

    return res.status(400).json({ message: 'Invalid Quiz ID format.' });
  }
  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid User ID format.' });
  }

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    let session;
    let inviteCode;
    const maxRetries = 10; // 최대 10번 재시도

    for (let i = 0; i < maxRetries; i++) {
      try {
        inviteCode = Math.random().toString(36).substring(2, 8);
        
        session = await GameSession.create({
          quizId,
          players: [{
            userId,
            username,
            score: 0,
            answered: {},
            connected: true,
            lastSeen: new Date(),
            socketId: null
          }],
          startedAt: new Date(),
          questionStartAt: null,
          isActive: true,
          currentQuestionIndex: 0,
          inviteCode,
          isStarted: false,
          host: userId,
        });

        // 성공 시 루프 탈출
        break;

      } catch (err) {
        if (err.code === 11000) { // 중복 키 오류인 경우
          console.warn(`Invite code collision detected: ${inviteCode}. Retrying... (${i + 1}/${maxRetries})`);
          // 루프 계속
        } else {
          // 다른 종류의 오류는 즉시 던짐
          throw err;
        }
      }
    }

    if (!session) {
      // 모든 재시도 실패 시
      throw new Error('Failed to generate a unique invite code after several attempts.');
    }

    res.status(201).json({
      message: 'Game session created successfully',
      sessionId: session._id,
      inviteCode,
    });
  } catch (err) {
    console.error('Failed to create game session:', err);
    res.status(500).json({ message: 'Failed to create game session', error: err.message });
  }
});

// 세션 참여 라우트
router.post('/join', authMiddleware, async (req, res) => {
  const { inviteCode } = req.body;
  const { id: userId, username } = req.user;
  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);

  if (!inviteCode) {
    return res.status(400).json({ message: '초대 코드를 입력해주세요.' });
  }

  try {
    const session = await GameSession.findOne({ inviteCode });
    if (!session) {
      return res.status(404).json({ message: '유효하지 않은 초대 코드입니다.' });
    }

    const existingPlayer = session.players.find(player => player.userId.toString() === userId);
    if (existingPlayer) {
      // 이미 참여한 플레이어면 상태만 업데이트 (재연결)
      existingPlayer.connected = true;
      existingPlayer.lastSeen = new Date();
      existingPlayer.socketId = null; // Socket ID는 나중에 업데이트됨
      
      await session.save();
      
      return res.status(200).json({ 
        message: '세션에 다시 참여했습니다.', 
        sessionId: session._id,
        reconnected: true
      });
    }

    // 새 플레이어 추가
    session.players.push({
      userId,
      username,
      score: 0,
      answered: {},
      connected: true, // 초기 연결 상태
      lastSeen: new Date(),
      socketId: null
    });

    await session.save();

    res.status(200).json({ 
      message: '세션에 성공적으로 참여했습니다.', 
      sessionId: session._id 
    });

  } catch (err) {
    console.error('Failed to join game session:', err);
    res.status(500).json({ message: '세션 참여에 실패했습니다.', error: err.message });
  }
});


router.get('/invite/:code', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);

  try {
    const session = await GameSession.findOne({ inviteCode: req.params.code });
    if (!session) return res.status(404).json({ message: '세션 없음' });

    res.json({ sessionId: session._id });
  } catch (err) {
    res.status(500).json({ message: '에러 발생', error: err.message });
  }
});

// GET /game/chat/:sessionId
router.get('/chat/:sessionId', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const ChatLog = require('../models/ChatLog')(quizDb);

  try {
    const chatLog = await ChatLog.findOne({ sessionId: req.params.sessionId }).lean();
    if (!chatLog) return res.json({ messages: [] });

    res.json({ messages: chatLog.messages || [] });
  } catch (err) {
    res.status(500).json({ message: '채팅 기록 조회 실패', error: err.message });
  }
});

module.exports = router;
