const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  text: { type: String, maxlength: 84 },
  questionType: { type: String, enum: ['text', 'image', 'video', 'audio'], required: true, default: 'text' },
  imageBase64: { type: String },
  youtubeUrl: { type: String },
  youtubeStartTime: { type: Number, default: 0 },
  youtubeEndTime: { type: Number, default: 0 },
  youtubeLoop: { type: Boolean, default: false },
  answerYoutubeUrl: { type: String },
  answerYoutubeStartTime: { type: Number, default: 0 },
  answerYoutubeEndTime: { type: Number, default: 0 },
  answers: { type: [String], required: true },
  incorrectAnswers:{ type: [String] },
  isChoice: { type: Boolean, default: false },
  answerImageBase64: { type: String },
  order: { type: Number, required: true },
  timeLimit: {type: Number, default: 90 , min: 5, max: 1800 },
});

const quizSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  titleImageBase64: { 
    type: String,
    required: true,
  },
  description: String,
  creatorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  questions: [questionSchema],
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