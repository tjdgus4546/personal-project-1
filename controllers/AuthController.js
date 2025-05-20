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

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '잘못된 비밀번호입니다.' });
    }

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: '2h',
    });

    res.json({ token });
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

module.exports = { signup, login, getUserInfo };
