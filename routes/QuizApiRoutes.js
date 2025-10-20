const express = require('express');
const { ObjectId } = require('mongoose').Types;
const { uploadQuizImagesToS3, deleteImageFromS3 } = require('../utils/s3Uploader'); // 🔥 S3 업로드

module.exports = (quizDb) => {
  const publicRouter = express.Router();
  const privateRouter = express.Router();
  const Quiz = require('../models/Quiz')(quizDb);

  // IP 주소 추출 헬퍼 함수
  function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           'unknown';
  }

  // --- Public Routes (인증 불필요) ---

  // 사용자 닉네임 조회 (공개)
  publicRouter.get('/user/:userId/nickname', async (req, res) => {
    try {
      const userDb = req.app.get('userDb');
      const User = require('../models/User')(userDb);

      const user = await User.findById(req.params.userId).select('nickname');

      if (!user) {
        return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
      }

      res.json({ nickname: user.nickname });
    } catch (err) {
      console.error('사용자 닉네임 조회 실패:', err);
      res.status(500).json({ message: '사용자 닉네임 조회 실패', error: err.message });
    }
  });

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
        case 'recommended':
          sortCondition = { recommendationCount: -1, createdAt: -1 };
          break;
        case 'popular':
        default:
          sortCondition = { completedGameCount: -1, createdAt: -1 };
          break;
      }

      // 🔥 Native MongoDB Collection 사용 - 불필요한 배열 제외!
      const QuizCollection = Quiz.collection;
      const quizzes = await QuizCollection.find({ isComplete: true })
        .project({
          questions: 0,          // ← 용량 큰 questions 배열 제외!
          reports: 0,            // ← 불필요한 reports 배열 제외
          modificationLogs: 0,   // ← 수정 로그 제외! (이게 범인!)
          creationLog: 0,        // ← 생성 로그도 제외
        })
        .sort(sortCondition)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // 제작자 정보 추가 (N+1 쿼리 방지 - 한 번에 조회)
      const userDb = req.app.get('userDb');
      const User = require('../models/User')(userDb);

      // 1. 모든 creatorId 수집 (seized 제외)
      const creatorIds = [...new Set(
        quizzes
          .map(q => q.creatorId?.toString ? q.creatorId.toString() : q.creatorId)
          .filter(id => id !== 'seized' && id != null)
      )];

      // 2. 한 번에 모든 사용자 조회
      const creators = await User.find({ _id: { $in: creatorIds } })
        .select('_id nickname')
        .lean();

      // 3. Map으로 변환 (O(1) 조회)
      const creatorMap = new Map(creators.map(c => [c._id.toString(), c.nickname]));

      // 4. 퀴즈에 제작자 정보 추가 (DB 조회 없음!)
      const quizzesWithCreator = quizzes.map((quiz) => {
        // Native collection이므로 이미 plain object
        const creatorIdStr = quiz.creatorId?.toString ? quiz.creatorId.toString() : quiz.creatorId;

        // 압수된 퀴즈는 제작자를 "관리자"로 표시
        if (creatorIdStr === 'seized') {
          quiz.creatorNickname = '관리자';
        } else {
          quiz.creatorNickname = creatorMap.get(creatorIdStr) || '알 수 없음';
        }

        return quiz;
      });

      const hasMore = quizzes.length === parseInt(limit);

      res.json({ quizzes: quizzesWithCreator, hasMore, page: parseInt(page), limit: parseInt(limit), sort: sort });
    } catch (err) {
      console.error('퀴즈 목록 불러오기 실패:', err);
      res.status(500).json({ message: '퀴즈 목록 불러오기 실패', error: err.message });
    }
  });

  publicRouter.get('/quiz/search', async (req, res) => {
    const { q, page = 1, limit = 20, sort = 'latest' } = req.query;
    const skip = (page - 1) * limit;

    try {
        const userDb = req.app.get('userDb');
        const User = require('../models/User')(userDb);

        // 정렬 조건 설정
        let sortCondition;
        switch (sort) {
            case 'latest':
                sortCondition = { createdAt: -1 };
                break;
            case 'recommended':
                sortCondition = { recommendationCount: -1, createdAt: -1 };
                break;
            case 'popular':
                sortCondition = { completedGameCount: -1, createdAt: -1 };
                break;
            default:
                sortCondition = { createdAt: -1 };
                break;
        }

        let quizzes = [];

        if (q && q.trim()) {
            // 1. 닉네임으로 검색된 사용자 찾기
            const users = await User.find({
                nickname: { $regex: q.trim(), $options: 'i' }
            }).select('_id');

            const userIds = users.map(user => user._id.toString());

            // 2. 제목, 설명, 제작자로 퀴즈 검색
            const query = {
                isComplete: true,
                $or: [
                    { title: { $regex: q.trim(), $options: 'i' } },
                    { description: { $regex: q.trim(), $options: 'i' } },
                    { creatorId: { $in: userIds } }
                ]
            };

            quizzes = await Quiz.find(query)
                .select('title description titleImageBase64 createdAt completedGameCount recommendationCount creatorId')
                .sort(sortCondition)
                .skip(skip)
                .limit(parseInt(limit));
        } else {
            // 검색어가 없으면 전체 목록 반환
            quizzes = await Quiz.find({ isComplete: true })
                .select('title description titleImageBase64 createdAt completedGameCount recommendationCount creatorId')
                .sort(sortCondition)
                .skip(skip)
                .limit(parseInt(limit));
        }

        // 제작자 정보 추가
        const quizzesWithCreator = await Promise.all(quizzes.map(async (quiz) => {
            const quizObj = quiz.toObject();

            // 압수된 퀴즈는 제작자를 "관리자"로 표시
            if (quizObj.creatorId === 'seized') {
                quizObj.creatorNickname = '관리자';
            } else {
                try {
                    const creator = await User.findById(quizObj.creatorId).select('nickname');
                    quizObj.creatorNickname = creator ? creator.nickname : '알 수 없음';
                } catch (err) {
                    quizObj.creatorNickname = '알 수 없음';
                }
            }

            return quizObj;
        }));

        const hasMore = quizzes.length === parseInt(limit);

        res.json({ quizzes: quizzesWithCreator, hasMore, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        console.error('검색 API 에러:', err);
        res.status(500).json({ message: '검색 중 오류가 발생했습니다', error: err.message });
    }
  });

  // ✅ 퀴즈 정보 조회 - 맨 위에 배치 (누구나 접근 가능)
  publicRouter.get('/quiz/:id', async (req, res, next) => {
    
    try {
        if (!ObjectId.isValid(req.params.id)) {
          return next();  // privateRouter로 넘어감
        }
        
        const quiz = await Quiz.findById(req.params.id);
        
        if (!quiz) {
          return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        }

        res.json(quiz);
    } catch (err) {
        console.error('퀴즈 불러오기 실패:', err);
        res.status(500).json({ message: '퀴즈 불러오기 실패', error: err.message });
    }
  });

  // --- Private Routes (인증 필요) ---

  // 사용자 통계 정보 (만든 퀴즈 개수, 플레이한 퀴즈 개수)
  privateRouter.get('/user/stats', async (req, res) => {
    try {
      const userId = req.user.id;

      // 만든 퀴즈 개수 계산 (정상 퀴즈 + 압수된 퀴즈 포함)
      const createdQuizzes = await Quiz.countDocuments({
        $or: [
          { creatorId: userId.toString() },                     // 정상 퀴즈
          { creatorId: 'seized', originalCreatorId: userId }   // 압수된 퀴즈 (원래 내가 만든 것)
        ]
      });

      // 플레이한 퀴즈 개수는 User 모델에서 가져오기
      const userDb = req.app.get('userDb');
      const User = require('../models/User')(userDb);
      const user = await User.findById(userId).select('playedQuizzes');
      const playedQuizzes = user?.playedQuizzes?.length || 0;

      res.json({
        createdQuizzes,
        playedQuizzes
      });
    } catch (err) {
      console.error('사용자 통계 조회 실패:', err);
      res.status(500).json({
        message: '통계 조회 실패',
        error: err.message,
        createdQuizzes: 0,
        playedQuizzes: 0
      });
    }
  });

  // 나의 퀴즈 확인
  privateRouter.get('/quiz/my-list', async (req, res) => {
    try {
      const userId = req.user.id;

      // 정상 퀴즈와 압수된 퀴즈 모두 조회
      const quizzes = await Quiz.find({
        $or: [
          { creatorId: userId.toString() },                                    // 정상 퀴즈 (내가 만든 퀴즈)
          { creatorId: 'seized', originalCreatorId: userId }                   // 압수된 퀴즈 (원래 내가 만들었던 것)
        ]
      }).sort({ createdAt: -1 });

      res.json(quizzes);
    } catch (err) {
      console.error('퀴즈 조회 에러:', err);
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

      // 🔥 임시 퀴즈 생성 (ID 먼저 생성)
      const newQuiz = new Quiz({
        title,
        description,
        creatorId: req.user.id,
        titleImageBase64: titleImageBase64 || '', // 임시로 Base64 저장
        questions: [],
        isComplete: false,
        creationLog: {
          ip: getClientIp(req),
          timestamp: new Date()
        }
      });
      await newQuiz.save();

      // 🔥 S3에 썸네일 업로드
      if (titleImageBase64 && !titleImageBase64.startsWith('http')) {
        try {
          const updatedData = await uploadQuizImagesToS3(
            { titleImageBase64 },
            newQuiz._id.toString()
          );
          newQuiz.titleImageBase64 = updatedData.titleImageBase64;
          await newQuiz.save();
        } catch (s3Error) {
          console.error('S3 업로드 실패 (퀴즈는 생성됨):', s3Error);
          // S3 업로드 실패해도 Base64로 유지하고 계속 진행
        }
      }

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

        // 압수된 퀴즈는 수정 불가
        if (quiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 수정할 수 없습니다.' });
        }

        // 작성자이거나 관리자인지 확인
        const isCreator = quiz.creatorId.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isCreator && !isAdmin) {
          return res.status(403).json({ message: '권한이 없습니다.' });
        }

        // 이전 문제들의 S3 이미지 URL 수집
        const bucketName = process.env.S3_BUCKET_NAME || 'playcode-quiz-images';
        const oldImageUrls = new Set();
        if (quiz.questions && Array.isArray(quiz.questions)) {
          quiz.questions.forEach(q => {
            if (q.imageBase64 && q.imageBase64.includes(bucketName)) {
              oldImageUrls.add(q.imageBase64);
            }
            if (q.answerImageBase64 && q.answerImageBase64.includes(bucketName)) {
              oldImageUrls.add(q.answerImageBase64);
            }
          });
        }

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

        // 🔥 S3에 이미지 업로드
        try {
          const updatedData = await uploadQuizImagesToS3(
            { questions: quiz.questions },
            quiz._id.toString()
          );
          quiz.questions = updatedData.questions;
        } catch (s3Error) {
          console.error('S3 업로드 실패 (Base64로 유지):', s3Error);
          // S3 업로드 실패해도 Base64로 유지하고 계속 진행
        }

        // 새 문제들의 S3 이미지 URL 수집
        const newImageUrls = new Set();
        quiz.questions.forEach(q => {
          if (q.imageBase64 && q.imageBase64.includes(bucketName)) {
            newImageUrls.add(q.imageBase64);
          }
          if (q.answerImageBase64 && q.answerImageBase64.includes(bucketName)) {
            newImageUrls.add(q.answerImageBase64);
          }
        });

        // 더 이상 사용하지 않는 S3 이미지 삭제
        for (const oldUrl of oldImageUrls) {
          if (!newImageUrls.has(oldUrl)) {
            await deleteImageFromS3(oldUrl).catch(err =>
              console.error('이전 문제 이미지 삭제 실패:', err)
            );
          }
        }

        // IP 로그 추가
        quiz.modificationLogs.push({
          ip: getClientIp(req),
          timestamp: new Date()
        });

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

        // 압수된 퀴즈는 공개 불가
        if (quiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 공개할 수 없습니다.' });
        }

        // 작성자이거나 관리자인지 확인
        const isCreator = quiz.creatorId.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isCreator && !isAdmin) {
          return res.status(403).json({ message: '권한이 없습니다.' });
        }
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

        // 압수된 퀴즈는 수정 불가
        if (quiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 수정할 수 없습니다.' });
        }

        // 작성자이거나 관리자인지 확인
        const isCreator = quiz.creatorId.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isCreator && !isAdmin) {
          return res.status(403).json({ message: '권한이 없습니다.' });
        }
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
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

        // 압수된 퀴즈는 원 작성자가 삭제할 수 없음
        if (quiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 삭제할 수 없습니다.' });
        }

        if (quiz.creatorId.toString() !== req.user.id) {
          return res.status(403).json({ message: '삭제 권한이 없습니다.' });
        }

        // S3 이미지 삭제 (실패해도 퀴즈 삭제는 계속 진행)
        const bucketName = process.env.S3_BUCKET_NAME || 'playcode-quiz-images';

        // 썸네일 이미지 삭제
        if (quiz.titleImageBase64 && quiz.titleImageBase64.includes(bucketName)) {
          await deleteImageFromS3(quiz.titleImageBase64).catch(err =>
            console.error('썸네일 삭제 실패:', err)
          );
        }

        // 문제 이미지 및 정답 이미지 삭제
        if (quiz.questions && Array.isArray(quiz.questions)) {
          for (const question of quiz.questions) {
            if (question.imageBase64 && question.imageBase64.includes(bucketName)) {
              await deleteImageFromS3(question.imageBase64).catch(err =>
                console.error('문제 이미지 삭제 실패:', err)
              );
            }
            if (question.answerImageBase64 && question.answerImageBase64.includes(bucketName)) {
              await deleteImageFromS3(question.answerImageBase64).catch(err =>
                console.error('정답 이미지 삭제 실패:', err)
              );
            }
          }
        }

        await Quiz.findByIdAndDelete(req.params.id);
        res.json({ message: '퀴즈 삭제 성공' });
    } catch (err) {
        res.status(500).json({ message: '퀴즈 삭제 실패', error: err.message });
    }
  });

  // 퀴즈 제목/설명/썸네일/랜덤순서 등 수정
  privateRouter.put('/quiz/:id', async (req, res) => {
    const { title, description, titleImageBase64, isRandomOrder } = req.body;
    try {
        // 압수된 퀴즈인지 먼저 확인
        const existingQuiz = await Quiz.findById(req.params.id);
        if (!existingQuiz) {
          return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        }

        if (existingQuiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 수정할 수 없습니다.' });
        }

        const updateFields = {};
        if (title !== undefined) updateFields.title = title;
        if (description !== undefined) updateFields.description = description;
        if (isRandomOrder !== undefined) updateFields.isRandomOrder = isRandomOrder;

        // 🔥 S3에 썸네일 이미지 업로드
        if (titleImageBase64 !== undefined && !titleImageBase64.startsWith('http')) {
          try {
            // 이전 S3 썸네일 삭제
            const bucketName = process.env.S3_BUCKET_NAME || 'playcode-quiz-images';
            if (existingQuiz.titleImageBase64 && existingQuiz.titleImageBase64.includes(bucketName)) {
              await deleteImageFromS3(existingQuiz.titleImageBase64).catch(err =>
                console.error('이전 썸네일 삭제 실패:', err)
              );
            }

            const updatedData = await uploadQuizImagesToS3(
              { titleImageBase64 },
              req.params.id
            );
            updateFields.titleImageBase64 = updatedData.titleImageBase64;
          } catch (s3Error) {
            console.error('S3 업로드 실패 (Base64로 유지):', s3Error);
            updateFields.titleImageBase64 = titleImageBase64; // 실패 시 Base64로 유지
          }
        } else if (titleImageBase64 !== undefined) {
          updateFields.titleImageBase64 = titleImageBase64; // 이미 S3 URL인 경우
        }

        // 작성자이거나 관리자인지 확인
        const isCreator = existingQuiz.creatorId.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isCreator && !isAdmin) {
          return res.status(403).json({ message: '권한이 없습니다.' });
        }

        // IP 로그 추가
        updateFields.$push = {
          modificationLogs: {
            ip: getClientIp(req),
            timestamp: new Date()
          }
        };

        const quiz = await Quiz.findByIdAndUpdate(
            req.params.id,
            updateFields,
            { new: true }
        );
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
        res.json({ message: '퀴즈 수정 완료', quiz });
    } catch (err) {
        console.error('퀴즈 수정 실패:', err);
        res.status(500).json({ message: '퀴즈 수정 실패', error: err.message });
    }
  });


  // 개별 문제 수정/추가
  privateRouter.put('/quiz/:quizId/question/:questionIndex', async (req, res) => {
    try {
        const { questionIndex } = req.params;
        const questionData = req.body;
        const quiz = await Quiz.findById(req.params.quizId);
        if (!quiz) return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });

        // 압수된 퀴즈는 수정 불가
        if (quiz.creatorId === 'seized') {
          return res.status(403).json({ message: '압수된 퀴즈는 수정할 수 없습니다.' });
        }

        // 작성자이거나 관리자인지 확인
        const isCreator = quiz.creatorId.toString() === req.user.id;
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        if (!isCreator && !isAdmin) {
          return res.status(403).json({ message: '권한이 없습니다.' });
        }

        const index = parseInt(questionIndex);
        if (index < 0 || index > quiz.questions.length) {
            return res.status(400).json({ message: '잘못된 문제 인덱스입니다.' });
        }

        // 이전 문제의 S3 이미지 URL 저장 (수정 시에만)
        const bucketName = process.env.S3_BUCKET_NAME || 'playcode-quiz-images';
        let oldQuestionImageUrl = null;
        let oldAnswerImageUrl = null;
        if (index < quiz.questions.length) {
          const oldQuestion = quiz.questions[index];
          if (oldQuestion.imageBase64 && oldQuestion.imageBase64.includes(bucketName)) {
            oldQuestionImageUrl = oldQuestion.imageBase64;
          }
          if (oldQuestion.answerImageBase64 && oldQuestion.answerImageBase64.includes(bucketName)) {
            oldAnswerImageUrl = oldQuestion.answerImageBase64;
          }
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

        // 🔥 S3에 이미지 업로드 (해당 문제만)
        try {
          const updatedData = await uploadQuizImagesToS3(
            { questions: quiz.questions },
            quiz._id.toString()
          );
          quiz.questions = updatedData.questions;
        } catch (s3Error) {
          console.error('S3 업로드 실패 (Base64로 유지):', s3Error);
          // S3 업로드 실패해도 Base64로 유지하고 계속 진행
        }

        // 이전 문제 이미지가 변경된 경우 S3에서 삭제
        const newQuestion = quiz.questions[index];
        if (oldQuestionImageUrl && newQuestion.imageBase64 !== oldQuestionImageUrl) {
          await deleteImageFromS3(oldQuestionImageUrl).catch(err =>
            console.error('이전 문제 이미지 삭제 실패:', err)
          );
        }
        if (oldAnswerImageUrl && newQuestion.answerImageBase64 !== oldAnswerImageUrl) {
          await deleteImageFromS3(oldAnswerImageUrl).catch(err =>
            console.error('이전 정답 이미지 삭제 실패:', err)
          );
        }

        // IP 로그 추가
        quiz.modificationLogs.push({
          ip: getClientIp(req),
          timestamp: new Date()
        });

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

  // 퀴즈 신고
  privateRouter.post('/quiz/:id/report', async (req, res) => {
    try {
      const { reason } = req.body;

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ message: '신고 사유를 입력해주세요.' });
      }

      const quiz = await Quiz.findById(req.params.id);
      if (!quiz) {
        return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
      }

      // 자기 퀴즈는 신고 불가
      if (quiz.creatorId.toString() === req.user.id) {
        return res.status(400).json({ message: '자신의 퀴즈는 신고할 수 없습니다.' });
      }

      // 이미 신고한 사용자인지 확인
      const alreadyReported = quiz.reports.some(
        report => report.reporterId.toString() === req.user.id
      );

      if (alreadyReported) {
        return res.status(400).json({ message: '이미 신고한 퀴즈입니다.' });
      }

      // 신고 추가 - $push 연산자 사용 (validation 우회)
      const updatedQuiz = await Quiz.findByIdAndUpdate(
        req.params.id,
        {
          $push: {
            reports: {
              reporterId: req.user.id,
              reason: reason.trim(),
              reportedAt: new Date()
            }
          }
        },
        { new: true }
      );

      res.json({
        message: '신고가 접수되었습니다.',
        reportCount: updatedQuiz.reports.length
      });
    } catch (err) {
      console.error('Quiz report error:', err);
      res.status(500).json({ message: '신고 처리 중 오류가 발생했습니다.', error: err.message });
    }
  });

  return { publicRouter, privateRouter };
};
