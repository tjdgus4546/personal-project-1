// GameRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types;
const jwt = require('jsonwebtoken');

const authenticateToken = require('../middlewares/AuthMiddleware');

// 세션 정보 조회
router.get('/session/:id', authenticateToken, async (req, res) => {
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
    const isHost = session.host ? session.host.toString() === req.user.id : false;
    const isParticipant = session.players.some(p => p.userId.toString() === req.user.id);

    if (!isHost && !isParticipant) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    // 퀴즈 정보 가져오기 (추천 정보 포함)
    const quiz = await Quiz.findById(session.quizId).lean();
    if (!quiz) return res.status(404).json({ message: '퀴즈 없음' });

    // 현재 사용자가 이 퀴즈를 추천했는지 확인 (O(1) 인덱스 검색)
    let hasRecommended = false;
    try {
      const Recommendation = require('../models/Recommendation')(quizDb);
      hasRecommended = await Recommendation.exists({
        userId: new ObjectId(req.user.id),
        quizId: new ObjectId(session.quizId)
      });
    } catch (recErr) {
      console.error('추천 확인 중 오류 (무시하고 계속):', recErr);
      // 에러가 나도 계속 진행 (추천 기능만 비활성화)
    }

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

    // 추천 정보 추가
    quiz.hasRecommended = !!hasRecommended;

    // 제작자 닉네임 추가
    if (quiz.creatorId === 'seized') {
      quiz.creatorNickname = '관리자';
    } else if (quiz.creatorId) {
      try {
        const creator = await User.findById(quiz.creatorId).select('nickname').lean();
        quiz.creatorNickname = creator ? creator.nickname : '알 수 없음';
      } catch (err) {
        console.error('제작자 정보 조회 실패:', err);
        quiz.creatorNickname = '알 수 없음';
      }
    } else {
      quiz.creatorNickname = '알 수 없음';
    }

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
router.post('/start', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  const { quizId } = req.body;
  const { id: userId } = req.user;

  if (!ObjectId.isValid(quizId)) {

    return res.status(400).json({ message: 'Invalid Quiz ID format.' });
  }
  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid User ID format.' });
  }

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    // 🔒 비공개 퀴즈는 세션 생성 불가
    if (!quiz.isComplete) {
      return res.status(403).json({ message: '비공개 상태의 퀴즈는 플레이할 수 없습니다.' });
    }

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
router.post('/join', authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;
  const { id: userId } = req.user;
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

module.exports = router;