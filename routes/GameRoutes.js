// GameRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types;

// 세션 정보 조회
router.get('/session/:id', async (req, res) => {
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
router.post('/start', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  const { quizId, username, userId } = req.body;

  if (!ObjectId.isValid(quizId) || !ObjectId.isValid(userId)) {
    return res.status(400).json({ message: '잘못된 퀴즈 ID 또는 유저 ID 형식입니다.' });
  }

  try {
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: '퀴즈 없음' });

    const inviteCode = Math.random().toString(36).substring(2, 8); // 예: "a1b2c3"

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
      message: '게임 세션 생성 완료',
      sessionId: session._id,
      inviteCode,
    });
  } catch (err) {
    console.error('게임 세션 생성 실패:', err);
    res.status(500).json({ message: '게임 세션 생성 실패', error: err.message });
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
