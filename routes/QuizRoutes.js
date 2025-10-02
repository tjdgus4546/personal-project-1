const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongoose').Types; // ObjectId 추가
const jwt = require('jsonwebtoken');
const path = require('path');

// JWT 인증 미들웨어 (GameRoutes.js와 중복되므로, 별도 파일로 분리하는 것을 권장합니다)
const authenticateToken = require('../middlewares/AuthMiddleware');

const authMiddlewareForPages = async (req, res, next) => {
  try {
    await authenticateToken(req, res, next);
  } catch (error) {
    // API 미들웨어에서 JSON 응답을 보내려고 하면, 페이지 요청에서는 리다이렉트로 변경
    if (res.headersSent) return;
    
    // 토큰 갱신 실패 시 로그인 페이지로 리다이렉트
    return res.status(401).redirect('/login?reason=session_expired');
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

router.get('/quiz/edit', authMiddlewareForPages, async (req, res) => {
  const { quizId } = req.query;
  if (!quizId) {
    return res.status(400).send('<h1>잘못된 접근입니다.</h1><p>퀴즈 ID가 필요합니다. <a href="/">홈으로 돌아가기</a></p>');
  }

  try {
    const quizDb = req.app.get('quizDb');
    const Quiz = require('../models/Quiz')(quizDb);
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).send('<h1>퀴즈를 찾을 수 없습니다.</h1><p><a href="/">홈으로 돌아가기</a></p>');
    }

    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).send('<h1>접근 권한이 없습니다.</h1><p>자신이 만든 퀴즈만 수정할 수 있습니다. <a href="/">홈으로 돌아가기</a></p>');
    }

    res.sendFile(path.join(__dirname, '../public/quiz-edit.html'));
  } catch (error) {
    console.error('Error in /quiz/edit route:', error);
    res.status(500).send('<h1>서버 오류</h1><p>페이지를 불러오는 중 문제가 발생했습니다. <a href="/">홈으로 돌아가기</a></p>');
  }
});

// 세션 만료 페이지 라우트
router.get('/quiz/session-expired', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/session-expired.html'));
});

// 퀴즈 세션 페이지 라우트
router.get('/quiz/:sessionId', authMiddlewareForPages, async (req, res) => {
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