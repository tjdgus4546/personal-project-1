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
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const session = await GameSession.findById(req.params.id).lean();
    if (!session) return res.status(404).json({ message: '세션 없음' });

    // 인가 로직: 이 사용자가 해당 세션에 참여할 권한이 있는가?
    const isHost = session.host.toString() === req.user.id;
    const isParticipant = session.players.some(p => p.userId.toString() === req.user.id);

    if (!isHost && !isParticipant) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    const quiz = await Quiz.findById(session.quizId).lean();
    if (!quiz) return res.status(404).json({ message: '퀴즈 없음' });

    const correctUsers = session.correctUsers || {};
    quiz.questions.forEach((q, i) => {
      q.correctUsers = correctUsers[i] || [];
    });

    session.quiz = quiz;

    res.json(session);
  } catch (err) {
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

    const inviteCode = Math.random().toString(36).substring(2, 8);

    const session = await GameSession.create({
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

    // 이미 참여한 사용자인지 확인
    const isAlreadyPlayer = session.players.some(player => player.userId.toString() === userId);
    if (isAlreadyPlayer) {
      return res.status(409).json({ message: '이미 참여한 세션입니다.', sessionId: session._id });
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
