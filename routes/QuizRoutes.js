const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/AuthMiddleware');
const path = require('path');

router.post('/quiz/create', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const { title, description, questions } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: '필수 항목 누락' });
    }

    const newQuiz = new Quiz({
      title,
      description,
      creatorId: req.user.id, // ✅ JWT에서 추출한 사용자 ID
      questions
    });

    await newQuiz.save();
    res.status(201).json({ message: '퀴즈 생성 성공', quizId: newQuiz._id });
  } catch (err) {
    console.error('퀴즈 저장 오류:', err);
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
});

router.get('/quiz/create', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/quiz-create.html'));
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

router.get('/quiz/:id', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

    res.json(quiz); // 전체 문제 포함해서 보냄
  } catch (err) {
    res.status(500).json({ message: '퀴즈 불러오기 실패', error: err.message });
  }
});


module.exports = router;