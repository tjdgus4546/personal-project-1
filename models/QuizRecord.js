const mongoose = require('mongoose');
const { Schema } = mongoose;

// 퀴즈별 플레이 기록 (점수만 저장)
const quizRecordSchema = new Schema({
  quizId: {
    type: Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true,
    unique: true, // 퀴즈당 하나의 Record만 존재
    index: true
  },
  records: [
    {
      score: {
        type: Number,
        required: true,
        min: 0
      }
      // 닉네임, userId 등 다른 정보는 저장하지 않음 (성능 최적화)
    }
  ],
  totalCount: {
    type: Number,
    default: 0,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 업데이트 시 updatedAt 자동 갱신
quizRecordSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = (quizDb) => quizDb.model('QuizRecord', quizRecordSchema);
