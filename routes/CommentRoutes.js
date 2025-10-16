const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/AuthMiddleware');
const { ObjectId } = require('mongoose').Types;

// GET /api/quiz/:quizId/comments - 퀴즈의 모든 댓글 조회
router.get('/quiz/:quizId/comments', async (req, res) => {
  const { quizId } = req.params;

  if (!ObjectId.isValid(quizId)) {
    return res.status(400).json({ message: '유효하지 않은 퀴즈 ID입니다.' });
  }

  try {
    const mainDb = req.app.get('userDb'); // Comment는 userDb에 저장
    const Comment = require('../models/Comment')(mainDb);

    // 퀴즈별 댓글 조회 (최신순)
    const comments = await Comment.find({ quizId })
      .sort({ createdAt: -1 })
      .lean();

    // 프로필 이미지가 숨겨진 경우 null로 처리
    const sanitizedComments = comments.map(comment => ({
      ...comment,
      profileImage: comment.isProfileHidden ? null : comment.profileImage,
    }));

    res.json({ success: true, comments: sanitizedComments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: '댓글 조회 중 오류가 발생했습니다.', error: error.message });
  }
});

// POST /api/quiz/:quizId/comment - 새 댓글 작성
router.post('/quiz/:quizId/comment', authenticateToken, async (req, res) => {
  const { quizId } = req.params;
  const { content } = req.body;

  if (!ObjectId.isValid(quizId)) {
    return res.status(400).json({ message: '유효하지 않은 퀴즈 ID입니다.' });
  }

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ message: '댓글 내용을 입력해주세요.' });
  }

  if (content.length > 500) {
    return res.status(400).json({ message: '댓글은 최대 500자까지 작성할 수 있습니다.' });
  }

  try {
    const quizDb = req.app.get('quizDb');
    const mainDb = req.app.get('userDb');

    const Quiz = require('../models/Quiz')(quizDb);
    const User = require('../models/User')(mainDb);
    const Comment = require('../models/Comment')(mainDb);

    // 퀴즈 존재 여부 확인
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: '퀴즈를 찾을 수 없습니다.' });
    }

    // 사용자 정보 조회
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 댓글 생성
    const newComment = await Comment.create({
      quizId,
      userId: req.user.id,
      nickname: user.nickname,
      profileImage: user.profileImage || null,
      content: content.trim(),
    });

    res.status(201).json({
      success: true,
      message: '댓글이 작성되었습니다.',
      comment: {
        _id: newComment._id,
        quizId: newComment.quizId,
        userId: newComment.userId,
        nickname: newComment.nickname,
        profileImage: newComment.profileImage,
        content: newComment.content,
        createdAt: newComment.createdAt,
      }
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ message: '댓글 작성 중 오류가 발생했습니다.', error: error.message });
  }
});

module.exports = router;
