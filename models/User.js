const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
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
});

userSchema.index({ email: 1, provider: 1 }, { unique: true });

module.exports = (userDb) => userDb.model('User', userSchema);