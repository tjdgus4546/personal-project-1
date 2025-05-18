const mongoose = require('mongoose');
const { Schema } = mongoose;

const quizSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  questions: [
    {
      type: Schema.Types.ObjectId,
      ref: "Question",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);