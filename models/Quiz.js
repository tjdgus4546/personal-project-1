const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  text: { type: String },
  imageBase64: { type: String },
  youtubeUrl: { type: String },
  answers: { type: [String], required: true },
  incorrectAnswers:{ type: [String] },
  answerImageBase64: { type: String },
  order: { type: Number, required: true },
  timeLimit: {type: Number, default: 90 , min: 5, max: 180 },
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