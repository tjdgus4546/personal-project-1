// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// JWT 인증 미들웨어
const authenticateToken = (req, res, next) => {
  const token = req.cookies.accessToken; // Read token from HttpOnly cookie

  if (!token) {
    return res.status(401).json({ message: '토큰이 없습니다.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user; // 인증된 사용자 정보를 요청 객체에 추가
    next();
  } catch (err) {
    console.error('JWT 인증 오류:', err.message);
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(403).json({ message: '유효하지 않은 토큰입니다. 다시 로그인해주세요.' });
  }
};

module.exports = authenticateToken;
