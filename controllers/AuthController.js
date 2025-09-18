const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// 회원가입
const signup = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  const { username, nickname, email, password } = req.body;

  if (!username || !nickname || !email || !password) {
    return res.status(400).json({ message: '모든 필드를 입력해주세요.' });
  }

  try {
    // 이메일 중복 체크
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: '이메일이 이미 사용 중입니다.' });
    }

    // 닉네임 중복 체크
    const existingNickname = await User.findOne({ nickname });
    if (existingNickname) {
      return res.status(400).json({ message: '닉네임이 이미 사용 중입니다.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ 
      username: username.trim(),
      nickname: nickname.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword 
    });
    await newUser.save();

    res.status(201).json({ message: '회원가입 성공!' });
  } catch (err) {
    console.error('회원가입 에러:', err);
    if (err.code === 11000) {
      // MongoDB 중복 키 에러
      const field = Object.keys(err.keyPattern)[0];
      const message = field === 'email' ? '이메일이 이미 사용 중입니다.' : 
                     field === 'nickname' ? '닉네임이 이미 사용 중입니다.' : '중복된 값이 있습니다.';
      return res.status(400).json({ message });
    }
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

    // OAuth 사용자인 경우 (password가 없는 경우)
    if (!user.password && user.naverId) {
      return res.status(400).json({ 
        message: '네이버 로그인으로 가입된 계정입니다. 네이버 로그인을 이용해주세요.' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '잘못된 비밀번호입니다.' });
    }

    const accessToken = jwt.sign(
      { id: user._id, username: user.username, nickname: user.nickname }, 
      JWT_SECRET, 
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: '7d',
    });

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
      // path 제거로 미들웨어에서 접근 가능하도록 함
    });

    res.json({
      message: 'Login successful',
      username: user.username,
      nickname: user.nickname,
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
  res.clearCookie('refreshToken');
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

    const newAccessToken = jwt.sign(
      { id: user._id, username: user.username, nickname: user.nickname }, 
      JWT_SECRET, 
      { expiresIn: '15m' }
    );

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
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