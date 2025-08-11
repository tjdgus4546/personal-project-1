const express = require('express');
const authenticateToken = require('../middlewares/AuthMiddleware');

module.exports = (quizDb) => {
  const router = express.Router();
  const Quiz = require('../models/Quiz')(quizDb);

//나의 퀴즈 확인
router.get('/quiz/my-list', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quizzes = await Quiz.find({ creatorId: req.user.id }).sort({ createdAt: -1 });
    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ message: '퀴즈 조회 실패', error: err.message });
  }
});

//퀴즈 제목 설명 저장
router.post('/quiz/init', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const { title, description, titleImageBase64 } = req.body;

    if (!title) {
      return res.status(400).json({ message: '퀴즈 제목은 필수입니다.' });
    }

    const newQuiz = new Quiz({
      title,
      description,
      creatorId: req.user.id,
      titleImageBase64,
      questions: [], // 문제는 비어있음
      isComplete: false // 이후에 추가될 필드 (선택)
    });

    await newQuiz.save();

    res.status(201).json({ message: '퀴즈 생성 시작됨', quizId: newQuiz._id });
  } catch (err) {
    console.error('퀴즈 init 오류:', err);
    res.status(500).json({ message: '퀴즈 생성 실패', error: err.message });
  }
});

// 퀴즈에 문제 한 개 추가
router.post('/quiz/:id/add-question', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const { text, answers, answerImageBase64, imageBase64, youtubeUrl, timeLimit } = req.body;

    if (imageBase64 && youtubeUrl) {
      return res.status(400).json({ message: '이미지와 유튜브는 하나만 선택하세요.' });
    }

    if (!answers || answers.length === 0) {
      return res.status(400).json({ message: '정답은 필수입니다.' });
    }

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

    // 권한 체크
    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const questionText = (text && text.trim()) || quiz.title;
    const order = quiz.questions.length + 1;

    let parsedTimeLimit = parseInt(timeLimit, 10);
    if (isNaN(parsedTimeLimit) || parsedTimeLimit < 5 || parsedTimeLimit > 30) {
      parsedTimeLimit = 15;
    }

    const rawAnswers = Array.isArray(answers)
      ? answers
      : answers.split(',').map(a => a.trim()).filter(Boolean);

    const newQuestion = {
      text: questionText,
      answers: rawAnswers,
      imageBase64: imageBase64?.trim() || null,
      answerImageBase64: answerImageBase64?.trim() || null,
      youtubeUrl: youtubeUrl?.trim() || null,
      order,
      timeLimit: parsedTimeLimit
    };

    quiz.questions.push(newQuestion);
    await quiz.save();

    res.status(201).json({ message: '문제 추가 성공', order });
  } catch (err) {
    console.error('문제 추가 오류:', err);
    res.status(500).json({ message: '문제 추가 실패', error: err.message });
  }
});

// 문제 삭제
router.delete('/quiz/:quizId/question/:questionId', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });

    const originalLength = quiz.questions.length;
    quiz.questions = quiz.questions.filter(q => q._id.toString() !== req.params.questionId);

    // order 값 다시 정렬 (선택)
    quiz.questions.forEach((q, idx) => { q.order = idx + 1; });

    if (quiz.questions.length === originalLength) {
      return res.status(404).json({ message: '문제를 찾을 수 없습니다.' });
    }
    await quiz.save();

    res.json({ message: '문제 삭제 성공' });
  } catch (err) {
    res.status(500).json({ message: '문제 삭제 실패', error: err.message });
  }
});

//문제 수정
router.put('/quiz/:quizId/question/:questionId', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  try {
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });
    
    const question = quiz.questions.id(req.params.questionId);
    if (!question) return res.status(404).json({ message: '문제를 찾을 수 없습니다.' });
    
    // 수정할 필드만 바꿈
    if (req.body.text !== undefined) question.text = req.body.text;
    if (req.body.answers !== undefined) {
      const rawAnswers = Array.isArray(req.body.answers)
      ? req.body.answers
      : req.body.answers.split(',').map(a => a.trim()).filter(Boolean);
      
      question.answers = rawAnswers;
    }

    if (req.body.timeLimit !== undefined) {
      let parsed = parseInt(req.body.timeLimit, 10);
      question.timeLimit = (isNaN(parsed) || parsed < 5 || parsed > 180) ? 90 : parsed;
    }
    if (req.body.imageBase64 !== undefined) {
      question.imageBase64 = req.body.imageBase64;
    }
    if (req.body.answerImageBase64 !== undefined) {
      question.answerImageBase64 = req.body.answerImageBase64;
    }
    await quiz.save();

    res.json({ message: '문제 수정 완료' });
  } catch (err) {
    res.status(500).json({ message: '문제 수정 실패', error: err.message });
  }
});

//퀴즈 작성 완료(공개)
router.post('/quiz/:id/complete', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    quiz.isComplete = true;
    await quiz.save();

    res.json({ message: '퀴즈가 완료되었습니다.' });
  } catch (err) {
    res.status(500).json({ message: '퀴즈 완료 처리 실패', error: err.message });
  }
});

//퀴즈 비공개
router.put('/quiz/:id/incomplete', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    quiz.isComplete = false;
    await quiz.save();

    res.json({ message: '퀴즈가 완료되었습니다.' });
  } catch (err) {
    res.status(500).json({ message: '퀴즈 완료 처리 실패', error: err.message });
  }
});

// 퀴즈 삭제
router.delete('/quiz/:id', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findOneAndDelete({
      _id: req.params.id,
      creatorId: req.user.id, // 본인만 삭제 가능
    });

    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    res.json({ message: '퀴즈 삭제 성공' });
  } catch (err) {
    res.status(500).json({ message: '퀴즈 삭제 실패', error: err.message });
  }
});

// 퀴즈 제목/설명 수정
router.put('/quiz/:id', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  const { title, description } = req.body;

  try {
    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, creatorId: req.user.id },
      { title, description },
      { new: true }
    );

    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    res.json({ message: '퀴즈 수정 완료', quiz });
  } catch (err) {
    res.status(500).json({ message: '퀴즈 수정 실패', error: err.message });
  }
});

router.get('/quiz/:id', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

    // 퀴즈가 완료되었거나, 본인이 만든 퀴즈인 경우에만 조회를 허용
    if (quiz.isComplete || quiz.creatorId.toString() === req.user.id) {
      res.json(quiz); // 전체 문제 포함해서 보냄
    } else {
      res.status(403).json({ message: '권한이 없습니다.' });
    }
  } catch (err) {
    res.status(500).json({ message: '퀴즈 불러오기 실패', error: err.message });
  }
});

return router;

};