const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/AuthMiddleware');
const path = require('path');

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

router.get('/quiz/session', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-session.html'));
});

module.exports = router;