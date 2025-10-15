const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    maxlength: 20,
  },
  nickname: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 11,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: function() {
      return !this.provider;
    },
  },
  naverId: {
    type: String,
    unique: true,
    sparse: true, // null 값 허용하면서 unique 유지
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true, // null 값 허용하면서 unique 유지
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  profileImage: {
    type: String,
    require: true,
  },
  provider: {
    type: String,
    enum: ['local', 'naver', 'google', 'kakao'],
    default: 'local'
  },
  providerId: {
    type: String,
    default: null
  },
  gameSessions: [
    {
      type: Schema.Types.ObjectId,
      ref: "GameSession",
    },
  ],
  playedQuizzes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz'
  }],
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user'
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletionScheduledAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  // 이메일 인증 관련
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: {
    type: String,
    default: null
  },
  verificationCodeExpires: {
    type: Date,
    default: null
  }
});

// 기존 인덱스
userSchema.index({ email: 1, provider: 1 }, { unique: true });

module.exports = (userDb) => userDb.model('User', userSchema);