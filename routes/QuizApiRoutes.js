const express = require('express');

module.exports = (quizDb) => {
  const publicRouter = express.Router();
  const privateRouter = express.Router();
  const Quiz = require('../models/Quiz')(quizDb);

  // --- Public Routes (인증 불필요) ---

  // 공개된 퀴즈 목록만 반환 (메인페이지용)
  publicRouter.get('/quiz/list', async (req, res) => {
    const { page = 1, limit = 20, sort = 'popular' } = req.query;
    const skip = (page - 1) * limit;
    
    try {
      let sortCondition;
      switch (sort) {
        case 'latest':
          sortCondition = { createdAt: -1 };
          break;
        case 'oldest':
          sortCondition = { createdAt: 1 };
          break;
        case 'popular':
        default:
          sortCondition = { completedGameCount: -1, createdAt: -1 };
          break;
      }

      const quizzes = await Quiz.find(
        { isComplete: true },
        'title description titleImageBase64 createdAt completedGameCount'
      )
      .sort(sortCondition)
      .skip(skip)
      .limit(parseInt(limit));
      
      const hasMore = quizzes.length === parseInt(limit);
      
      res.json({ quizzes, hasMore, page: parseInt(page), limit: parseInt(limit), sort: sort });
    } catch (err) {
      console.error('퀴즈 목록 불러오기 실패:', err);
      res.status(500).json({ message: '퀴즈 목록 불러오기 실패', error: err.message });
    }
  });

  publicRouter.get('/quiz/search', async (req, res) => {
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
        
        res.json({ quizzes, hasMore, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('검색 API 에러:', err);
        res.status(500).json({ message: '검색 중 오류가 발생했습니다', error: err.message });
    }
  });

  // --- Private Routes (인증 필요) ---

  // 나의 퀴즈 확인
  privateRouter.get('/quiz/my-list', async (req, res) => {
    try {
      const quizzes = await Quiz.find({ creatorId: req.user.id }).sort({ createdAt: -1 });
      res.json(quizzes);
    } catch (err) {
      res.status(500).json({ message: '퀴즈 조회 실패', error: err.message });
    }
  });

  // 퀴즈 제목/설명 저장
  privateRouter.post('/quiz/init', async (req, res) => {
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
        questions: [],
        isComplete: false
      });
      await newQuiz.save();
      res.status(201).json({ message: '퀴즈 생성 시작됨', quizId: newQuiz._id });
    } catch (err) {
      console.error('퀴즈 init 오류:', err);
      res.status(500).json({ message: '퀴즈 생성 실패', error: err.message });
    }
  });

  // 퀴즈의 전체 문제 목록 업데이트
  privateRouter.put('/quiz/:quizId/questions', async (req, res) => {
    try {
        const { questions } = req.body;
        if (!Array.isArray(questions)) {
            return res.status(400).json({ message: '문제 목록은 배열이어야 합니다.' });
        }
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });

        quiz.questions = questions.map((q, index) => ({
            questionType: q.questionType || 'text',
            text: q.text,
            answers: q.answers,
            incorrectAnswers: q.incorrectAnswers || [],
            isChoice: q.isChoice || false,
            imageBase64: q.imageBase64 || null,
            answerImageBase64: q.answerImageBase64 || null,
            youtubeUrl: q.youtubeUrl || null,
            youtubeStartTime: q.youtubeStartTime || 0,
            youtubeEndTime: q.youtubeEndTime || 0,
            answerYoutubeUrl: q.answerYoutubeUrl || null,
            answerYoutubeStartTime: q.answerYoutubeStartTime || 0,
            order: index + 1,
            timeLimit: q.timeLimit || 90
        }));
        
        await quiz.save();
        res.json({ message: '문제 목록이 업데이트되었습니다.', questionCount: quiz.questions.length });
    } catch (err) {
        console.error('문제 목록 업데이트 실패:', err);
        res.status(500).json({ message: '문제 목록 업데이트 실패', error: err.message });
    }
  });

  // 퀴즈 작성 완료(공개)
  privateRouter.post('/quiz/:id/complete', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });
        if (quiz.questions.length < 1) { // 최소 문제 수 1개로 수정
            return res.status(400).json({ message: '퀴즈를 공개하려면 최소 1개의 문제가 필요합니다.' });
        }
        quiz.isComplete = true;
        await quiz.save();
        res.json({ message: '퀴즈가 완료되었습니다.' });
    } catch (err) {
        res.status(500).json({ message: '퀴즈 완료 처리 실패', error: err.message });
    }
  });

  // 퀴즈 비공개
  privateRouter.put('/quiz/:id/incomplete', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });
        quiz.isComplete = false;
        await quiz.save();
        res.json({ message: '퀴즈를 비공개로 전환했습니다.' });
    } catch (err) {
        res.status(500).json({ message: '퀴즈 비공개 처리 실패', error: err.message });
    }
  });

  // 퀴즈 삭제
  privateRouter.delete('/quiz/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findOneAndDelete({ _id: req.params.id, creatorId: req.user.id });
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없거나 삭제 권한이 없습니다.' });
        res.json({ message: '퀴즈 삭제 성공' });
    } catch (err) {
        res.status(500).json({ message: '퀴즈 삭제 실패', error: err.message });
    }
  });

  // 퀴즈 제목/설명/썸네일/랜덤순서 등 수정
  privateRouter.put('/quiz/:id', async (req, res) => {
    const { title, description, titleImageBase64, isRandomOrder } = req.body;
    try {
        const updateFields = {};
        if (title !== undefined) updateFields.title = title;
        if (description !== undefined) updateFields.description = description;
        if (titleImageBase64 !== undefined) updateFields.titleImageBase64 = titleImageBase64;
        if (isRandomOrder !== undefined) updateFields.isRandomOrder = isRandomOrder;

        const quiz = await Quiz.findOneAndUpdate(
            { _id: req.params.id, creatorId: req.user.id },
            updateFields,
            { new: true }
        );
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없거나 수정 권한이 없습니다.' });
        res.json({ message: '퀴즈 수정 완료', quiz });
    } catch (err) {
        console.error('퀴즈 수정 실패:', err);
        res.status(500).json({ message: '퀴즈 수정 실패', error: err.message });
    }
  });

  // (편집용) 개별 퀴즈 정보 조회
  privateRouter.get('/quiz/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        if (quiz.creatorId.toString() !== req.user.id) {
            return res.status(403).json({ message: '이 퀴즈를 편집할 권한이 없습니다.' });
        }
        res.json(quiz);
    } catch (err) {
        res.status(500).json({ message: '퀴즈 불러오기 실패', error: err.message });
    }
  });

  // 개별 문제 수정/추가
  privateRouter.put('/quiz/:quizId/question/:questionIndex', async (req, res) => {
    try {
        const { questionIndex } = req.params;
        const questionData = req.body;
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        if (quiz.creatorId.toString() !== req.user.id) return res.status(403).json({ message: '권한이 없습니다.' });

        const index = parseInt(questionIndex);
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
            quiz.questions.push(questionToSave);
        } else {
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

  return { publicRouter, privateRouter };
};
