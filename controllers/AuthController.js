const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// 회원가입
const signup = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: '이메일이 이미 사용 중입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: '회원가입 성공!' });
  } catch (err) {
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
};

// 로그인
const login = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);
  const JWT_SECRET = process.env.JWT_SECRET;

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '잘못된 비밀번호입니다.' });
    }

    const accessToken = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '15m', // 액세스 토큰 유효기간: 15분
    });

    const refreshToken = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: '7d', // 리프레시 토큰 유효기간: 7일
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // 프로덕션 환경에서는 https를 사용해야 합니다.
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15분
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    res.json({
      message: 'Login successful',
      username: user.username,
      userId: user._id
    });
  } catch (err) {
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
};

// 유저 정보 조회
const getUserInfo = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
};

const logout = (req, res) => {
  res.clearCookie('accessToken');
  // refreshToken을 삭제할 때, 생성 시 사용했던 path 옵션을 반드시 포함해야 합니다.
  res.clearCookie('refreshToken', { 
    path: '/auth/refresh',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.status(200).json({ message: '로그아웃 성공' });
};

const refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  if (!refreshToken) {
    return res.status(401).json({ message: '리프레시 토큰이 없습니다.' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    const newAccessToken = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '15m', // New access token valid for 15 minutes
    });

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15분
    });

    res.status(200).json({ message: '새로운 액세스 토큰 발급 성공' });

  } catch (err) {
    console.error('리프레시 토큰 검증 오류:', err.message);
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.status(403).json({ message: '유효하지 않은 리프레시 토큰입니다. 다시 로그인해주세요.' });
  }
};

module.exports = { signup, login, getUserInfo, logout, refreshToken };
