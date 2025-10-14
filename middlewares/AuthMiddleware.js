// middlewares/AuthMiddleware.js
// JWT 토큰에서 username 필드 제거

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// JWT 인증 미들웨어
const authenticateToken = async (req, res, next) => {
  const accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;

  // 액세스 토큰과 리프레시 토큰이 모두 없는 경우
  if (!accessToken && !refreshToken) {
    return res.status(401).json({ message: '인증이 필요합니다. 로그인해주세요.' });
  }

  // 1. 액세스 토큰이 있는 경우, 검증 시도
  if (accessToken) {
    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET);
      req.user = decoded; // 사용자 정보를 요청 객체에 저장 (username 없이)
      return next(); // 다음 미들웨어로 이동
    } catch (err) {
      if (err.name !== 'TokenExpiredError') {
        console.error('유효하지 않은 액세스 토큰:', err.message);
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(403).json({ message: '유효하지 않은 토큰입니다. 다시 로그인해주세요.' });
      }
    }
  }

  // 2. 액세스 토큰이 만료되었거나 없고, 리프레시 토큰이 있는 경우
  if (refreshToken) {
    try {
      const decodedRefresh = jwt.verify(refreshToken, JWT_SECRET);
      
      const userDb = req.app.get('userDb');
      const UserModel = require('../models/User')(userDb);
      const user = await UserModel.findById(decodedRefresh.id);

      // 리프레시 토큰에 해당하는 사용자가 DB에 없는 경우
      if (!user) {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return res.status(403).json({ message: '사용자를 찾을 수 없습니다. 다시 로그인해주세요.' });
      }

      const newAccessToken = jwt.sign(
        {
          id: user._id,
          nickname: user.nickname,
          role: user.role || 'user'
        },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      // 새로 발급한 액세스 토큰을 쿠키에 저장
      res.cookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });

      req.user = {
        id: user._id,
        nickname: user.nickname,
        role: user.role || 'user'
      };
      return next();

    } catch (err) {
      // 리프레시 토큰 자체가 유효하지 않은 경우
      console.error('리프레시 토큰 오류:', err.message);
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: '세션이 만료되었습니다. 다시 로그인해주세요.' });
    }
  } else {
    // 액세스 토큰은 없고 리프레시 토큰도 없는 경우
    return res.status(401).json({ message: '인증이 필요합니다. 로그인해주세요.' });
  }
};

module.exports = authenticateToken;