const mongoose = require('mongoose');
const { Schema } = mongoose;

const quizSchema = new Schema({
  title: {
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
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);