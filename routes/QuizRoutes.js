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

module.exports = router;