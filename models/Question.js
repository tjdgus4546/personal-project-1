const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  quiz: {
    type: Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
  },
  questionType: {
    type: String,
    enum: ["text", "image", "video"],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  textContent: {
    type: String,
    default: null,
  },
  imageData: {
    type: String,  // Base64 인코딩된 이미지 데이터
    default: null,
  },
  videoUrl: {
    type: String,
    default: null,
  },
  options: [
    {
      optionText: {
        type: String,
        required: true,
      },
      isCorrect: {
        type: Boolean,
        required: true,
      },
    },
  ],
  answerTimeLimit: {
    type: Number,
    default: 90,
  },
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);