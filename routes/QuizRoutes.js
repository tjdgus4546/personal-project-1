const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types; // ObjectId 추가
const jwt = require('jsonwebtoken');
const path = require('path');

// JWT 인증 미들웨어 (GameRoutes.js와 중복되므로, 별도 파일로 분리하는 것을 권장합니다)
const authMiddleware = (req, res, next) => {
  const token = req.cookies.accessToken;
  if (!token) {
    return res.status(401).redirect('/login'); // 페이지 요청이므로 로그인 페이지로 리다이렉트
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // 유효하지 않은 토큰이면 로그인 페이지로
    return res.status(401).redirect('/login?reason=invalid_token');
  }
};

router.get('/quiz/create', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-create.html'));
});

router.get('/quiz/my-list', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-my-list.html'))
});

router.get('/quiz/init', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-init.html'))
});

router.get('/quiz/edit', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-edit.html'))
});

router.get('/quiz/list', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  try {
    const quizzes = await Quiz.find({}, 'title description createdAt').sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: '퀴즈 목록 불러오기 실패', error: err.message });
  }
});

router.get('/quiz/list-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-list.html'));
});

router.get('/quiz/play', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-play.html'));
});

// 세션 만료 페이지 라우트
router.get('/quiz/session-expired', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/session-expired.html'));
});

// 퀴즈 세션 페이지 라우트
router.get('/quiz/:sessionId', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  const { id: userId } = req.user;

  if (!ObjectId.isValid(sessionId)) {
    return res.status(400).send('Invalid session ID format');
  }

  const quizDb = req.app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);

  try {
    const session = await GameSession.findById(sessionId).lean();

    if (!session) {
      // 세션이 없으면 세션 만료 페이지로 리다이렉트
      return res.redirect('/quiz/session-expired');
    }

    // 인가 로직: 사용자가 이 세션의 호스트이거나 참여자인지 확인
    const isHost = session.host.toString() === userId;
    const isParticipant = session.players.some(p => p.userId.toString() === userId);

    if (isHost || isParticipant) {
      // 허가된 사용자: 퀴즈 세션 페이지를 보냄
      res.sendFile(path.join(__dirname, '../public/quiz-session.html'));
    } else {
      // 허가되지 않은 사용자: 에러 메시지 또는 메인 페이지로 리디렉션
      res.status(403).send('<h1>접근 권한이 없습니다.</h1><p>초대코드로 게임에 입장하시길 바랍니다. <a href="/">홈으로 돌아가기</a></p>');
    }
  } catch (err) {
    console.error('Error authorizing session access:', err);
    res.status(500).send('Server error while checking session access.');
  }
});

module.exports = router;