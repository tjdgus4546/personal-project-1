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

// 공개된 퀴즈 목록만 반환 (메인페이지용)
router.get('/quiz/list', async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  const { page = 1, limit = 20, sort = 'popular' } = req.query;
  const skip = (page - 1) * limit;
  
  try {

    let sortCondition;
    switch (sort) {
      case 'latest':
        sortCondition = { createdAt: -1 }; // 최신순
        break;
      case 'oldest':
        sortCondition = { createdAt: 1 }; // 오래된순
        break;
      case 'popular':
      default:
        sortCondition = { 
          completedGameCount: -1,  // 플레이 횟수 내림차순 (많은 순)
          createdAt: -1           // 같은 플레이 횟수면 최신순
        };
        break;
    }

    // isComplete가 true인 퀴즈만 선택하고, 페이징 적용
    const quizzes = await Quiz.find(
      { isComplete: true }, // 완료된 퀴즈만
      'title description titleImageBase64 createdAt completedGameCount' // 필요한 필드만
    )
    .sort(sortCondition) // 최신순 정렬
    .skip(skip)
    .limit(parseInt(limit));
    
    // 더 로드할 데이터가 있는지 확인
    const hasMore = quizzes.length === parseInt(limit);
    
    res.json({ 
      quizzes, 
      hasMore, 
      page: parseInt(page),
      limit: parseInt(limit),
      sort: sort
    });
  } catch (err) {
    console.error('퀴즈 목록 불러오기 실패:', err);
    res.status(500).json({ message: '퀴즈 목록 불러오기 실패', error: err.message });
  }
});

router.get('/quiz/search', async (req, res) => {
    const quizDb = req.app.get('quizDb');
    const Quiz = require('../models/Quiz')(quizDb);
    
    const { q, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    try {
        let query = { isComplete: true };
        
        if (q && q.trim()) {
            query.$or = [
                { title: { $regex: q.trim(), $options: 'i' } },
                { description: { $regex: q.trim(), $options: 'i' } }
            ];
        }
        
        const quizzes = await Quiz.find(query)
            .select('title description titleImageBase64 createdAt completedGameCount')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const hasMore = quizzes.length === parseInt(limit);
        
        res.json({ 
          quizzes, 
          hasMore, 
          page: parseInt(page),
          limit: parseInt(limit)
        });
    } catch (err) {
        console.error('검색 API 에러:', err);
        res.status(500).json({ message: '검색 중 오류가 발생했습니다', error: err.message });
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
    const { text, answers, incorrectAnswers, answerImageBase64, imageBase64, youtubeUrl, timeLimit } = req.body;

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

    const rawIncorrectAnswers = Array.isArray(incorrectAnswers)
      ? incorrectAnswers
      : incorrectAnswers.split(',').map(a => a.trim()).filter(Boolean);

    const newQuestion = {
      text: questionText,
      answers: rawAnswers,
      incorrectAnswers: rawIncorrectAnswers,
      imageBase64: imageBase64?.trim() || null,
      answerImageBase64: answerImageBase64?.trim() || null,
      youtubeUrl: youtubeUrl?.trim() || null,
      youtubeStartTime: parseInt(youtubeStartTime) || 0,
      youtubeEndTime: parseInt(youtubeEndTime) || 0,
      youtubeLoop: youtubeLoop || false,
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

// 문제 추가 API 엔드포인트
router.post('/quiz/:quizId/question', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const { 
      text, 
      answers, 
      incorrectAnswers = [], 
      imageBase64, 
      answerImageBase64, 
      youtubeUrl, 
      youtubeStartTime, 
      youtubeEndTime, 
      youtubeLoop,
      timeLimit,
      questionType = 'text'  // 프론트엔드에서 전달받은 타입
    } = req.body;

    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    }

    // 권한 체크
    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }

    const questionText = (text && text.trim()) || quiz.title;
    const order = quiz.questions.length + 1;

    let parsedTimeLimit = parseInt(timeLimit, 10);
    if (isNaN(parsedTimeLimit) || parsedTimeLimit < 5 || parsedTimeLimit > 1800) {
      parsedTimeLimit = 90;
    }

    const rawAnswers = Array.isArray(answers)
      ? answers
      : answers.split(',').map(a => a.trim()).filter(Boolean);

    const rawIncorrectAnswers = Array.isArray(incorrectAnswers)
      ? incorrectAnswers
      : incorrectAnswers.split(',').map(a => a.trim()).filter(Boolean);

    const newQuestion = {
      questionType: questionType,  // 타입 저장
      text: questionText,
      answers: rawAnswers,
      incorrectAnswers: rawIncorrectAnswers,
      imageBase64: imageBase64?.trim() || null,
      answerImageBase64: answerImageBase64?.trim() || null,
      youtubeUrl: youtubeUrl?.trim() || null,
      youtubeStartTime: parseInt(youtubeStartTime) || 0,
      youtubeEndTime: parseInt(youtubeEndTime) || 0,
      youtubeLoop: youtubeLoop || false,
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

// 퀴즈의 전체 문제 목록 업데이트
router.put('/quiz/:quizId/questions', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  try {
    const { questions } = req.body;
    
    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: '문제 목록은 배열이어야 합니다.' });
    }
    
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    }
    
    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }
    
    // 문제 목록 업데이트 (order 필드 자동 설정)
    quiz.questions = questions.map((q, index) => ({
      // questionType 필드 추가
      questionType: q.questionType || 'text',
      
      text: q.text,
      answers: q.answers,
      incorrectAnswers: q.incorrectAnswers || [],
      isChoice: q.isChoice || false,
      
      // 이미지 관련
      imageBase64: q.imageBase64 || null,
      answerImageBase64: q.answerImageBase64 || null,
      incorrectImagesBase64: q.incorrectImagesBase64 || [],
      
      // 문제 영상
      youtubeUrl: q.youtubeUrl || null,
      youtubeStartTime: q.youtubeStartTime || 0,
      youtubeEndTime: q.youtubeEndTime || 0,
      youtubeLoop: q.youtubeLoop || false,
      
      // 정답 공개 영상
      answerYoutubeUrl: q.answerYoutubeUrl || null,
      answerYoutubeStartTime: q.answerYoutubeStartTime || 0,
      answerYoutubeEndTime: q.answerYoutubeEndTime || 0,
      
      order: index + 1,
      timeLimit: q.timeLimit || 90
    }));
    
    await quiz.save();
    
    res.json({ 
      message: '문제 목록이 업데이트되었습니다.', 
      questionCount: quiz.questions.length 
    });
  } catch (err) {
    console.error('문제 목록 업데이트 실패:', err);
    res.status(500).json({ message: '문제 목록 업데이트 실패', error: err.message });
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

    if (quiz.questions.length < 10) { 
      return res.status(400).json({ message: '퀴즈를 공개하려면 최소 10개의 문제가 필요합니다.' });
    };

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

// 퀴즈 제목/설명/썸네일 수정
router.put('/quiz/:id', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  const { title, description, titleImageBase64, isRandomOrder } = req.body;

  try {
    // 업데이트할 필드 준비
    const updateFields = {};
    
    if (title !== undefined) {
      updateFields.title = title;
    }
    
    if (description !== undefined) {
      updateFields.description = description;
    }
    
    if (titleImageBase64 !== undefined) {
      updateFields.titleImageBase64 = titleImageBase64;
    }

    if (isRandomOrder !== undefined) {
      updateFields.isRandomOrder = isRandomOrder;
    }

    const quiz = await Quiz.findOneAndUpdate(
      { _id: req.params.id, creatorId: req.user.id },
      updateFields,
      { new: true }
    );

    if (!quiz) {
      return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    }
    
    res.json({ message: '퀴즈 수정 완료', quiz });
  } catch (err) {
    console.error('퀴즈 수정 실패:', err);
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

// 사용자 통계 정보 API
router.get('/user/stats', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  try {
    const createdQuizzes = await Quiz.countDocuments({ creatorId: req.user.id });
    
    res.json({
      createdQuizzes: createdQuizzes,
      playedQuizzes: 0 // User 모델의 playedQuizzes 배열 길이로 나중에 수정 가능
    });
  } catch (error) {
    console.error('사용자 통계 조회 실패:', error);
    res.status(500).json({ message: '통계 정보를 불러올 수 없습니다.' });
  }
});

// QuizApiRoutes.js - 개별 문제 수정 API
router.put('/quiz/:quizId/question/:questionIndex', authenticateToken, async (req, res) => {
  const quizDb = req.app.get('quizDb');
  const Quiz = require('../models/Quiz')(quizDb);
  
  try {
    const { questionIndex } = req.params;
    const questionData = req.body;
    
    const quiz = await Quiz.findById(req.params.quizId);
    if (!quiz) {
      return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    }
    
    if (quiz.creatorId.toString() !== req.user.id) {
      return res.status(403).json({ message: '권한이 없습니다.' });
    }
    
    const index = parseInt(questionIndex);
    
    // ✅ 수정: 새 문제 추가도 허용 (index === length)
    if (index < 0 || index > quiz.questions.length) {
      return res.status(400).json({ message: '잘못된 문제 인덱스입니다.' });
    }
    
    const questionToSave = {
      questionType: questionData.questionType || 'text',
      text: questionData.text,
      answers: questionData.answers,
      incorrectAnswers: questionData.incorrectAnswers || [],
      isChoice: questionData.isChoice || false,
      imageBase64: questionData.imageBase64 || null,
      answerImageBase64: questionData.answerImageBase64 || null,
      youtubeUrl: questionData.youtubeUrl || null,
      youtubeStartTime: questionData.youtubeStartTime || 0,
      youtubeEndTime: questionData.youtubeEndTime || 0,
      answerYoutubeUrl: questionData.answerYoutubeUrl || null,
      answerYoutubeStartTime: questionData.answerYoutubeStartTime || 0,
      order: index + 1,
      timeLimit: questionData.timeLimit || 90
    };
    
    if (index === quiz.questions.length) {
      // 새 문제 추가
      quiz.questions.push(questionToSave);
    } else {
      // 기존 문제 수정
      quiz.questions[index] = questionToSave;
    }
    
    quiz.markModified('questions');
    await quiz.save();
    
    res.json({ 
      message: index === quiz.questions.length - 1 ? '문제가 추가되었습니다.' : '문제가 수정되었습니다.',
      question: quiz.questions[index]
    });
  } catch (err) {
    console.error('문제 수정 실패:', err);
    res.status(500).json({ message: '문제 수정 실패', error: err.message });
  }
});

return router;

};