// routes/NaverAuthRoutes.js
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

require('dotenv').config();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const NAVER_CALLBACK_URL = process.env.NAVER_CALLBACK_URL;
const JWT_SECRET = process.env.JWT_SECRET;

// 네이버 로그인 시작
router.get('/naver', (req, res) => {
  const state = uuidv4(); // CSRF 방지를 위한 state 값
  req.session.naverState = state; // 세션에 state 값 저장
  
  const naverAuthURL = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(NAVER_CALLBACK_URL)}&state=${state}`;
  
  res.redirect(naverAuthURL);
});

// 네이버 로그인 콜백
router.get('/naver/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // state 값 검증
  if (state !== req.session.naverState) {
    return res.status(400).json({ message: '잘못된 요청입니다.' });
  }
  
  try {
    // 1단계: 액세스 토큰 요청
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
    
    // 2단계: 사용자 정보 요청
    const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const naverUser = userResponse.data.response;
    
    // 3단계: 데이터베이스에서 사용자 확인/생성
    const userDb = req.app.get('userDb');
    const User = require('../models/User')(userDb);
    
    let user = await User.findOne({ email: naverUser.email });
    
    if (!user) {
      // 새 사용자 생성
      user = new User({
        username: naverUser.nickname || naverUser.name,
        email: naverUser.email,
        password: 'naver_oauth', // OAuth 사용자는 비밀번호가 없음을 표시
        profileImage: naverUser.profile_image || null,
        provider: 'naver',
        providerId: naverUser.id
      });
      
      await user.save();
    }
    
    // 4단계: JWT 토큰 생성
    const accessToken = jwt.sign(
      { id: user._id, username: user.username }, 
      JWT_SECRET, 
      { expiresIn: '15m' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    // 5단계: 쿠키 설정 및 리다이렉트
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
    });
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/auth/refresh'
    });
    
    // 세션 정리
    delete req.session.naverState;
    
    // 메인 페이지로 리다이렉트
    res.redirect('/');
    
  } catch (error) {
    console.error('네이버 로그인 처리 중 오류:', error);
    res.status(500).json({ message: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;