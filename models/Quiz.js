const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  text: { type: String, maxlength: 80 },
  questionType: { type: String, enum: ['text', 'image', 'video', 'audio'], required: true, default: 'text' },
  imageBase64: { type: String },
  youtubeUrl: { type: String },
  youtubeStartTime: { type: Number, default: 0 },
  youtubeEndTime: { type: Number, default: 0 },
  youtubeLoop: { type: Boolean, default: false },
  answerYoutubeUrl: { type: String },
  answerYoutubeStartTime: { type: Number, default: 0 },
  answerYoutubeEndTime: { type: Number, default: 0 },
  answers: {
    type: [String],
    required: true,
    validate: [v => v.length <= 20, '정답은 최대 20개까지 등록할 수 있습니다.'],
  },
  incorrectAnswers: {
    type: [String],
    validate: [v => v.length <= 4, '오답은 최대 4개까지 등록할 수 있습니다.'],
  },
  isChoice: { type: Boolean, default: false },
  answerImageBase64: { type: String },
  order: { type: Number, required: true },
  timeLimit: {type: Number, default: 90 , min: 5, max: 1800 },
});

const quizSchema = new Schema({
  title: {
    type: String,
    required: true,
    maxlength: 40,
  },
  titleImageBase64: { 
    type: String,
    required: true,
  },
  description: {
    type: String,
    maxlength: 40,
  },
  creatorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questions: {
    type: [questionSchema],
    validate: [v => v.length <= 30, '퀴즈의 문제 개수는 최대 30개까지 등록할 수 있습니다.'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isComplete: {
  type: Boolean,
  default: false,
  },
  completedGameCount: { 
  type: Number,
  default: 0
  },
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);