const express = require('express');
const path = require('path');
const router = express.Router();
const { signup, login, getUserInfo } = require('../controllers/AuthController');
const authenticateToken = require('../middlewares/AuthMiddleware');

// 로그인 페이지 라우팅
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// 회원가입 페이지 라우팅 (필요 시)
router.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/signup.html'));
});

// ✅ 로그인된 사용자 정보 요청 (GET /my-info)
router.get('/my-info', authenticateToken, getUserInfo);

router.post('/login', login);
router.post('/signup', signup);
router.get('/me', authenticateToken, getUserInfo);

module.exports = router;