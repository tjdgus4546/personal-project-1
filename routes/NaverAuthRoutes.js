const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

require('dotenv').config();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NAVER_CALLBACK_URL = process.env.NAVER_CALLBACK_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// 임시 사용자 정보 저장용 (실제로는 Redis나 DB 사용 권장)
const tempUserData = new Map();
const MAX_TEMP_USER_DATA_SIZE = 100; // 🛡️ 최대 100개로 제한 (메모리 누수 방지)

// OAuth 닉네임 설정 제한
const oauthSignupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 15분당 최대 5개 요청
  message: '회원가입 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 네이버 로그인 시작
router.get('/naver', (req, res) => {
  const state = uuidv4();
  req.session.naverState = state;
  
  const naverAuthURL = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&state=${state}`;
  
  res.redirect(naverAuthURL);
});

// 닉네임 설정 페이지
router.get('/naver/setup-nickname', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/naver-nickname-setup.html'));
});

// 임시 토큰으로 사용자 정보 조회
router.get('/naver/temp-info', (req, res) => {
  const tempToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (!tempToken || !tempUserData.has(tempToken)) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
  
  const userInfo = tempUserData.get(tempToken);
  res.json({
    name: userInfo.name,
    email: userInfo.email,
    profileImage: userInfo.profile_image
  });
});

// 닉네임 설정 완료
router.post('/naver/complete-signup', oauthSignupLimiter, async (req, res) => {
  const tempToken = req.headers.authorization?.replace('Bearer ', '');
  const { nickname } = req.body;
  
  if (!tempToken || !tempUserData.has(tempToken)) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
  
  if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 20) {
    return res.status(400).json({ message: '닉네임은 2-20글자여야 합니다.' });
  }
  
  try {
    const userDb = req.app.get('userDb');
    const User = require('../models/User')(userDb);
    const naverUserInfo = tempUserData.get(tempToken);
    
    // 닉네임 중복 체크
    const existingNickname = await User.findOne({ nickname: nickname.trim() });
    if (existingNickname) {
      return res.status(400).json({ message: '이미 사용중인 닉네임입니다.' });
    }
    
    // 기존 사용자 확인 (naverId 또는 email로)
    let user = await User.findOne({ 
      $or: [
        { naverId: naverUserInfo.id },
        { email: naverUserInfo.email }
      ]
    });
    
    if (user) {
      // 기존 사용자 업데이트
      user.nickname = nickname.trim();
      if (!user.naverId) user.naverId = naverUserInfo.id;
      if (!user.profileImage) user.profileImage = naverUserInfo.profile_image;
    } else {
      // 새 사용자 생성
      user = new User({
        username: naverUserInfo.name,
        nickname: nickname.trim(),
        email: naverUserInfo.email,
        naverId: naverUserInfo.id,
        profileImage: naverUserInfo.profile_image || null,
        provider: 'naver',  // OAuth provider 설정
        providerId: naverUserInfo.id,  // provider ID 설정
        isEmailVerified: true  // OAuth 사용자는 이메일 자동 인증
      });
    }
    
    await user.save();
    
    // JWT 토큰 생성
    const accessToken = jwt.sign(
      {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        role: user.role || 'user'
      },
      JWT_SECRET,
      { expiresIn: '6h' }
    );

    const refreshTokenJWT = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 쿠키 설정
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 6 * 60 * 60 * 1000
    });
    
    res.cookie('refreshToken', refreshTokenJWT, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
    // 임시 데이터 정리
    tempUserData.delete(tempToken);
    
    res.json({ 
      message: '닉네임 설정 완료',
      user: {
        username: user.username,
        nickname: user.nickname,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('닉네임 설정 완료 중 오류:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'nickname' ? '이미 사용중인 닉네임입니다.' : '중복된 정보가 있습니다.';
      return res.status(400).json({ message });
    }
    
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 네이버 로그인 콜백
router.get('/naver/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (state !== req.session.naverState) {
    console.error('네이버 OAuth state 불일치');
    return res.redirect('/login?error=auth_failed');
  }
  
  try {
    // 액세스 토큰 요청
    const tokenResponse = await axios.post('https://nid.naver.com/oauth2.0/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: NAVER_CLIENT_ID,
        client_secret: NAVER_CLIENT_SECRET,
        code: code,
        state: state
      }
    });
    
    const { access_token } = tokenResponse.data;
    
    // 사용자 정보 요청
    const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const naverUser = userResponse.data.response;
    
    // 기존 사용자 확인
    const userDb = req.app.get('userDb');
    const User = require('../models/User')(userDb);
    
    const existingUser = await User.findOne({ naverId: naverUser.id });

    if (existingUser) {
      // 탈퇴한 회원인지 확인
      if (existingUser.isDeleted) {
        console.log('탈퇴한 계정 로그인 시도:', existingUser.email);
        return res.redirect('/login?error=account_deleted');
      }

      // 이미 가입된 사용자 - 바로 로그인
      const accessToken = jwt.sign(
        {
          id: existingUser._id,
          username: existingUser.username,
          nickname: existingUser.nickname,
          role: existingUser.role || 'user'
        },
        JWT_SECRET,
        { expiresIn: '6h' }
      );

      const refreshTokenJWT = jwt.sign(
        { id: existingUser._id },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 6 * 60 * 60 * 1000
      });
      
      res.cookie('refreshToken', refreshTokenJWT, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      
      delete req.session.naverState;
      return res.redirect('/');
    }
    
    // 새 사용자 - 닉네임 설정 페이지로
    const tempToken = uuidv4();

    // 🛡️ 최대 크기 초과 시 가장 오래된 항목 삭제 (LRU 방식)
    if (tempUserData.size >= MAX_TEMP_USER_DATA_SIZE) {
      const firstKey = tempUserData.keys().next().value;
      tempUserData.delete(firstKey);
      console.warn(`⚠️ tempUserData 크기 제한 초과: 가장 오래된 항목 삭제됨`);
    }

    tempUserData.set(tempToken, naverUser);

    // 10분 후 자동 삭제
    setTimeout(() => {
      tempUserData.delete(tempToken);
    }, 10 * 60 * 1000);
    
    delete req.session.naverState;
    res.redirect(`/auth/naver/setup-nickname?temp_token=${tempToken}`);
    
  } catch (error) {
    console.error('네이버 로그인 처리 중 오류:', error);
    res.redirect('/login?error=auth_failed');
  }
});

module.exports = router;