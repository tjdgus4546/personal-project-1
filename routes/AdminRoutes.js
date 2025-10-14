const express = require('express');
const router = express.Router();
const path = require('path');
const { checkAdmin, checkSuperAdmin } = require('../middlewares/AdminMiddleware');

// 모든 admin 라우트에 권한 검증 적용
router.use((req, res, next) => {
  if (req.method === 'DELETE') {
    return checkSuperAdmin(req, res, next);
  }
  return checkAdmin(req, res, next);
});

// 관리자 대시보드 페이지
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// 신고 관리 페이지
router.get('/reports.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-reports.html'));
});

// 통계 페이지
router.get('/stats.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-stats.html'));
});

// ========== 최적화된 공통 함수 ==========

/**
 * 퀴즈 목록에 작성자/압수자 정보를 한 번에 추가 (N+1 문제 해결)
 */
async function enrichQuizzesWithUserInfo(quizzes, User) {
  if (quizzes.length === 0) return [];

  // 1. 모든 User ID 수집
  const userIds = new Set();
  quizzes.forEach(quiz => {
    if (quiz.creatorId && quiz.creatorId !== 'seized') {
      userIds.add(quiz.creatorId.toString());
    }
    if (quiz.originalCreatorId) {
      userIds.add(quiz.originalCreatorId.toString());
    }
    if (quiz.seizedById) {
      userIds.add(quiz.seizedById.toString());
    }
    // 신고자 ID도 수집
    if (quiz.reports && quiz.reports.length > 0) {
      quiz.reports.forEach(report => {
        if (report.reporterId) {
          userIds.add(report.reporterId.toString());
        }
      });
    }
  });

  // 2. 한 번에 모든 User 조회 (단 1번의 쿼리!)
  const users = await User.find({
    _id: { $in: Array.from(userIds) }
  })
    .select('_id username nickname email')
    .lean(); // Mongoose 오버헤드 제거

  // 3. User ID를 키로 하는 Map 생성 (O(1) 조회)
  const userMap = new Map();
  users.forEach(user => {
    userMap.set(user._id.toString(), user);
  });

  // 4. 각 퀴즈에 User 정보 매핑
  return quizzes.map(quiz => {
    let creator = null;
    let seizedBy = null;

    if (quiz.creatorId === 'seized' && quiz.originalCreatorId) {
      creator = userMap.get(quiz.originalCreatorId.toString()) || { username: 'Unknown', nickname: 'Unknown', email: 'N/A' };
      if (quiz.seizedById) {
        seizedBy = userMap.get(quiz.seizedById.toString()) || null;
      }
    } else if (quiz.creatorId !== 'seized') {
      creator = userMap.get(quiz.creatorId.toString()) || { username: 'Unknown', nickname: 'Unknown', email: 'N/A' };
    } else {
      creator = { username: 'Unknown', nickname: 'Unknown', email: 'N/A' };
    }

    // 신고자 정보 추가 (있는 경우)
    let reportsWithReporter = null;
    if (quiz.reports && quiz.reports.length > 0) {
      reportsWithReporter = quiz.reports.map(report => ({
        ...report,
        reporter: userMap.get(report.reporterId?.toString()) || { nickname: 'Unknown', email: 'N/A' }
      }));
    }

    // questions 필드가 있으면 필요한 정보만 추출 (이미지, 순서)
    let questionsPreview = null;
    if (quiz.questions && Array.isArray(quiz.questions)) {
      questionsPreview = quiz.questions.map(q => ({
        order: q.order,
        imageBase64: q.imageBase64,
        answerImageBase64: q.answerImageBase64
      }));
    }

    return {
      ...quiz,
      creator,
      seizedBy,
      reports: reportsWithReporter || quiz.reports,
      reportCount: quiz.reports?.length || 0,
      questions: questionsPreview // 이미지와 순서만 포함
    };
  });
}

// ========== API 엔드포인트 ==========

// 퀴즈 검색 API (최적화됨)
router.get('/quizzes/search', async (req, res) => {
  try {
    const searchTerm = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;
    const skip = (page - 1) * limit;
    const filterStatus = req.query.status || 'all';

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    const User = require('../models/User')(req.app.get('userDb'));

    let searchQuery = {};

    if (searchTerm) {
      // 작성자 검색 (인덱스 사용)
      const matchingUsers = await User.find({
        $or: [
          { nickname: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } }
        ]
      })
        .select('_id')
        .lean(); // lean() 추가

      const userIds = matchingUsers.map(user => user._id);

      searchQuery.$or = [
        { title: { $regex: searchTerm, $options: 'i' } },
        { creatorId: { $in: userIds } },
        { originalCreatorId: { $in: userIds } }
      ];
    }

    // 상태 필터
    if (filterStatus === 'public') {
      searchQuery.isComplete = true;
      searchQuery.creatorId = { $ne: 'seized' };
    } else if (filterStatus === 'private') {
      searchQuery.isComplete = false;
      searchQuery.creatorId = { $ne: 'seized' };
    } else if (filterStatus === 'seized') {
      searchQuery.creatorId = 'seized';
    }

    // 병렬로 카운트와 데이터 조회
    const [totalCount, quizzes] = await Promise.all([
      Quiz.countDocuments(searchQuery),
      Quiz.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // 한 번에 User 정보 추가
    const quizzesWithCreator = await enrichQuizzesWithUserInfo(quizzes, User);

    res.json({
      success: true,
      quizzes: quizzesWithCreator,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: skip + quizzes.length < totalCount
      }
    });
  } catch (err) {
    console.error('Admin quiz search error:', err);
    res.status(500).json({
      success: false,
      message: '퀴즈 검색에 실패했습니다.'
    });
  }
});

// 모든 퀴즈 조회 (최적화됨)
router.get('/quizzes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;
    const skip = (page - 1) * limit;
    const filterStatus = req.query.status || 'all';

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    const User = require('../models/User')(req.app.get('userDb'));

    let filterQuery = {};
    if (filterStatus === 'public') {
      filterQuery.isComplete = true;
      filterQuery.creatorId = { $ne: 'seized' };
    } else if (filterStatus === 'private') {
      filterQuery.isComplete = false;
      filterQuery.creatorId = { $ne: 'seized' };
    } else if (filterStatus === 'seized') {
      filterQuery.creatorId = 'seized';
    }

    // 병렬로 카운트와 데이터 조회
    const [totalCount, quizzes] = await Promise.all([
      Quiz.countDocuments(filterQuery),
      Quiz.find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // 한 번에 User 정보 추가
    const quizzesWithCreator = await enrichQuizzesWithUserInfo(quizzes, User);

    res.json({
      success: true,
      quizzes: quizzesWithCreator,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: skip + quizzes.length < totalCount
      }
    });
  } catch (err) {
    console.error('Admin quizzes load error:', err);
    res.status(500).json({
      success: false,
      message: '퀴즈 목록을 불러오는데 실패했습니다.'
    });
  }
});

// 퀴즈 공개/비공개 처리
router.patch('/quizzes/:quizId/visibility', async (req, res) => {
  try {
    const { quizId } = req.params;
    const { isComplete } = req.body;

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    await Quiz.findByIdAndUpdate(quizId, { isComplete });

    res.json({
      success: true,
      message: `퀴즈가 ${isComplete ? '공개' : '비공개'} 처리되었습니다.`
    });
  } catch (err) {
    console.error('Quiz visibility update error:', err);
    res.status(500).json({
      success: false,
      message: '처리 중 오류가 발생했습니다.'
    });
  }
});

// 퀴즈 압수 (작성자를 관리자로 변경하고 원본 작성자 백업)
router.post('/quizzes/:quizId/seize', async (req, res) => {
  try {
    const { quizId } = req.params;
    const { reason } = req.body;

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: '퀴즈를 찾을 수 없습니다.'
      });
    }

    // 이미 압수된 퀴즈인지 확인
    if (quiz.originalCreatorId) {
      return res.status(400).json({
        success: false,
        message: '이미 압수된 퀴즈입니다.'
      });
    }

    // 원본 작성자 백업 후 creatorId를 'seized'로 변경
    await Quiz.findByIdAndUpdate(quizId, {
      originalCreatorId: quiz.creatorId,
      creatorId: 'seized', // 압수된 퀴즈 표시
      seizedAt: new Date(),
      seizedById: req.user.id, // 압수한 관리자 ID 저장
      seizedReason: reason || '관리자 조치',
      isComplete: false // 압수 시 자동으로 비공개 처리
    });

    res.json({
      success: true,
      message: '퀴즈가 압수되었습니다. 원본 작성자는 더 이상 이 퀴즈에 접근할 수 없습니다.'
    });
  } catch (err) {
    console.error('Quiz seize error:', err);
    res.status(500).json({
      success: false,
      message: '압수 처리 중 오류가 발생했습니다.'
    });
  }
});

// 퀴즈 복구 (원본 작성자에게 되돌리기)
router.post('/quizzes/:quizId/restore', async (req, res) => {
  try {
    const { quizId } = req.params;

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: '퀴즈를 찾을 수 없습니다.'
      });
    }

    // 압수된 퀴즈가 아니면 복구 불가
    if (!quiz.originalCreatorId) {
      return res.status(400).json({
        success: false,
        message: '압수되지 않은 퀴즈는 복구할 수 없습니다.'
      });
    }

    // 원본 작성자로 복구
    await Quiz.findByIdAndUpdate(quizId, {
      creatorId: quiz.originalCreatorId, // 원본 작성자로 복구
      originalCreatorId: null,
      seizedAt: null,
      seizedById: null,
      seizedReason: null
    });

    res.json({
      success: true,
      message: '퀴즈가 원본 작성자에게 복구되었습니다.'
    });
  } catch (err) {
    console.error('Quiz restore error:', err);
    res.status(500).json({
      success: false,
      message: '복구 처리 중 오류가 발생했습니다.'
    });
  }
});

// 퀴즈 영구 삭제 (superadmin만 가능)
router.delete('/quizzes/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;
    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));

    const quiz = await Quiz.findByIdAndDelete(quizId);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: '퀴즈를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '퀴즈가 영구 삭제되었습니다.'
    });
  } catch (err) {
    console.error('Quiz delete error:', err);
    res.status(500).json({
      success: false,
      message: '삭제 중 오류가 발생했습니다.'
    });
  }
});

// 신고된 퀴즈 목록 조회 (최적화됨)
router.get('/reported-quizzes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;
    const skip = (page - 1) * limit;

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));
    const User = require('../models/User')(req.app.get('userDb'));

    // 병렬로 카운트와 데이터 조회
    const [totalCount, quizzes] = await Promise.all([
      Quiz.countDocuments({ 'reports.0': { $exists: true } }),
      Quiz.find({ 'reports.0': { $exists: true } })
        .sort({ 'reports.0.reportedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // 한 번에 User 정보 추가 (신고자 포함)
    const quizzesWithDetails = await enrichQuizzesWithUserInfo(quizzes, User);

    res.json({
      success: true,
      quizzes: quizzesWithDetails,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: skip + quizzes.length < totalCount
      }
    });
  } catch (err) {
    console.error('Reported quizzes load error:', err);
    res.status(500).json({
      success: false,
      message: '신고된 퀴즈 목록을 불러오는데 실패했습니다.'
    });
  }
});

// 신고 삭제
router.delete('/quizzes/:quizId/reports', async (req, res) => {
  try {
    const { quizId } = req.params;
    const { reportIds } = req.body;

    const Quiz = require('../models/Quiz')(req.app.get('quizDb'));

    if (reportIds && Array.isArray(reportIds)) {
      await Quiz.findByIdAndUpdate(quizId, {
        $pull: {
          reports: { _id: { $in: reportIds } }
        }
      });
    } else {
      await Quiz.findByIdAndUpdate(quizId, {
        $set: { reports: [] }
      });
    }

    res.json({
      success: true,
      message: '신고가 삭제되었습니다.'
    });
  } catch (err) {
    console.error('Report delete error:', err);
    res.status(500).json({
      success: false,
      message: '신고 삭제 중 오류가 발생했습니다.'
    });
  }
});

// ========== 접속 통계 API ==========

// 접속 통계 조회
router.get('/stats', async (req, res) => {
  try {
    const AccessLog = require('../models/AccessLog')(req.app.get('userDb'));
    const io = req.app.get('io');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 병렬로 모든 통계 조회
    const [dailyVisitors, weeklyVisitors, monthlyVisitors, dailyPageviews, weeklyPageviews, monthlyPageviews] = await Promise.all([
      // 일일 순 방문자 (고유 IP)
      AccessLog.distinct('ip', { timestamp: { $gte: today } }),
      // 주간 순 방문자
      AccessLog.distinct('ip', { timestamp: { $gte: weekAgo } }),
      // 월간 순 방문자
      AccessLog.distinct('ip', { timestamp: { $gte: monthAgo } }),
      // 일일 페이지뷰
      AccessLog.countDocuments({ timestamp: { $gte: today } }),
      // 주간 페이지뷰
      AccessLog.countDocuments({ timestamp: { $gte: weekAgo } }),
      // 월간 페이지뷰
      AccessLog.countDocuments({ timestamp: { $gte: monthAgo } })
    ]);

    // 동시 접속자 수 (Socket.IO 연결 수)
    const onlineUsers = io.engine.clientsCount || 0;

    // 시간대별 접속 통계 (오늘)
    const hourlyStats = await AccessLog.aggregate([
      {
        $match: { timestamp: { $gte: today } }
      },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
          uniqueIps: { $addToSet: '$ip' }
        }
      },
      {
        $project: {
          hour: '$_id',
          pageviews: '$count',
          visitors: { $size: '$uniqueIps' }
        }
      },
      {
        $sort: { hour: 1 }
      }
    ]);

    // 일주일 일별 통계
    const dailyStats = await AccessLog.aggregate([
      {
        $match: { timestamp: { $gte: weekAgo } }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          count: { $sum: 1 },
          uniqueIps: { $addToSet: '$ip' }
        }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          pageviews: '$count',
          visitors: { $size: '$uniqueIps' }
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    res.json({
      success: true,
      stats: {
        daily: {
          visitors: dailyVisitors.length,
          pageviews: dailyPageviews
        },
        weekly: {
          visitors: weeklyVisitors.length,
          pageviews: weeklyPageviews
        },
        monthly: {
          visitors: monthlyVisitors.length,
          pageviews: monthlyPageviews
        },
        online: onlineUsers,
        hourlyStats,
        dailyStats
      }
    });
  } catch (err) {
    console.error('Stats load error:', err);
    res.status(500).json({
      success: false,
      message: '통계를 불러오는데 실패했습니다.'
    });
  }
});

module.exports = router;
