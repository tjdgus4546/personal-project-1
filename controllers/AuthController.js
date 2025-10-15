// controllers/AuthController.js

const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// 회원가입
const signup = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  const { username, nickname, email, password } = req.body;

  if ( !nickname || !email || !password) {
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
      username: username.trim(),  // DB에는 저장하지만 사용 안 함
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

    // 탈퇴한 회원인지 확인
    if (user.isDeleted) {
      return res.status(403).json({
        message: '탈퇴한 계정입니다. 로그인할 수 없습니다.',
        deletionScheduledAt: user.deletionScheduledAt
      });
    }

    // OAuth 사용자인 경우 (password가 없는 경우)
    if (!user.password && user.naverId) {
      return res.status(400).json({
        message: '네이버 로그인으로 가입된 계정입니다. 네이버 로그인을 이용해주세요.'
      });
    }

    if (!user.password && user.googleId) {
      return res.status(400).json({
        message: '구글 로그인으로 가입된 계정입니다. 구글 로그인을 이용해주세요.'
      });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '잘못된 비밀번호입니다.' });
    }

    const accessToken = jwt.sign(
      { id: user._id, nickname: user.nickname, role: user.role || 'user' },
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
    });

    res.json({
      message: 'Login successful',
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
      { id: user._id, nickname: user.nickname, role: user.role || 'user' },
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

// 프로필 업데이트
const updateProfile = async (req, res) => {
  const userDb = req.app.get('userDb');
  const User = require('../models/User')(userDb);

  const { nickname, currentPassword, newPassword, profileImage, removeProfileImage } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    let updateData = {};

    // 닉네임 변경
    if (nickname && nickname !== user.nickname) {
      // 닉네임 중복 체크
      const existingNickname = await User.findOne({ 
        nickname: nickname.trim(),
        _id: { $ne: req.user.id } // 현재 사용자 제외
      });
      
      if (existingNickname) {
        return res.status(400).json({ message: '이미 사용중인 닉네임입니다.' });
      }
      
      updateData.nickname = nickname.trim();
    }

    // 프로필 이미지 처리
    if (profileImage) {
      // 새 이미지가 제공된 경우
      if (!profileImage.startsWith('data:image/')) {
        return res.status(400).json({ message: '유효하지 않은 이미지 형식입니다.' });
      }
      
      // 이미지 크기 확인 (Base64 디코딩 후 대략 200KB 이하)
      const imageSize = Math.round((profileImage.length * 3) / 4 / 1024); // KB
      if (imageSize > 200) {
        return res.status(400).json({ message: '이미지 크기가 너무 큽니다. (최대 200KB)' });
      }
      
      updateData.profileImage = profileImage;
    } else if (removeProfileImage) {
      // 현재 이미지 제거 (OAuth 연동 사용자는 기본 이미지로 복원)
      if (user.naverId) {
        updateData.profileImage = 'https://ssl.pstatic.net/static/pwe/address/img_profile.png';
      } else if (user.googleId) {
        updateData.profileImage = null;  // 구글은 기본 이미지 URL이 없으므로 null
      } else {
        updateData.profileImage = null;
      }
    }

    // 비밀번호 변경 (OAuth 사용자가 아닌 경우에만)
    if (newPassword && !user.naverId && !user.googleId) {
      if (!currentPassword) {
        return res.status(400).json({ message: '현재 비밀번호를 입력해주세요.' });
      }

      // 현재 비밀번호 확인
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
      }

      // 새 비밀번호 해시화
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
    } else if (newPassword && user.naverId) {
      return res.status(400).json({ message: '네이버 연동 계정은 비밀번호를 변경할 수 없습니다.' });
    } else if (newPassword && user.googleId) {
      return res.status(400).json({ message: '구글 연동 계정은 비밀번호를 변경할 수 없습니다.' });
    }

    // 업데이트할 데이터가 없는 경우
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: '변경할 정보가 없습니다.' });
    }

    // 사용자 정보 업데이트
    await User.findByIdAndUpdate(req.user.id, updateData, { new: true });

    let responseMessage = '프로필이 성공적으로 업데이트되었습니다.';
    
    // 구체적인 변경 내용 알림
    const changes = [];
    if (updateData.nickname) changes.push('닉네임');
    if (updateData.profileImage !== undefined) changes.push('프로필 이미지');
    if (updateData.password) changes.push('비밀번호');
    
    if (changes.length > 0) {
      responseMessage = `${changes.join(', ')}이(가) 성공적으로 업데이트되었습니다.`;
    }

    res.json({ message: responseMessage });

  } catch (err) {
    console.error('프로필 업데이트 에러:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: '이미 사용중인 닉네임입니다.' });
    }
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
};

// 회원 탈퇴
const deleteAccount = async (req, res) => {
  const userDb = req.app.get('userDb');
  const quizDb = req.app.get('quizDb');
  const User = require('../models/User')(userDb);
  const Quiz = require('../models/Quiz')(quizDb);

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    // 이미 탈퇴한 회원인지 확인
    if (user.isDeleted) {
      return res.status(400).json({ message: '이미 탈퇴한 계정입니다.' });
    }

    const now = new Date();
    const sixMonthsLater = new Date(now.getTime() + (6 * 30 * 24 * 60 * 60 * 1000)); // 6개월 후

    // 해당 회원의 모든 퀴즈를 비공개 처리
    // 압수되지 않은 퀴즈(creatorId가 userId인 경우)만 비공개 처리
    const quizUpdateResult = await Quiz.updateMany(
      {
        creatorId: req.user.id.toString(),
        isComplete: true
      },
      {
        $set: { isComplete: false }
      }
    );

    console.log(`회원 탈퇴: ${user.email} - ${quizUpdateResult.modifiedCount}개의 퀴즈 비공개 처리됨`);

    // 소프트 삭제: 즉시 삭제하지 않고 표시만
    user.isDeleted = true;
    user.deletedAt = now;
    user.deletionScheduledAt = sixMonthsLater;

    // 비밀번호는 즉시 삭제 (보안)
    user.password = undefined;

    await user.save();

    // 쿠키 삭제
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.json({
      message: '회원 탈퇴가 완료되었습니다. 6개월 후 모든 정보가 완전히 삭제됩니다.',
      deletionScheduledAt: sixMonthsLater
    });

  } catch (err) {
    console.error('회원 탈퇴 오류:', err);
    res.status(500).json({ message: '서버 오류', error: err.message });
  }
};

module.exports = { signup, login, getUserInfo, logout, refreshToken, updateProfile, deleteAccount };