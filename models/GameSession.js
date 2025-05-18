const mongoose = require('mongoose');
const { Schema } = mongoose;

const gameSessionSchema = new Schema({
  quiz: {
    type: Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
  },
  participants: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      score: {
        type: Number,
        default: 0,
      },
    },
  ],
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
    required: true,
  },
  chatLogs: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      message: String,
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);