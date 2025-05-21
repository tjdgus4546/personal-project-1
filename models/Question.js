const mongoose = require('mongoose');
const { Schema } = mongoose;


const questionSchema = new Schema({
  text: { type: String, required: true },
  imageBase64: { type: String },
  youtubeUrl: { type: String },
  answer: { type: String, required: true },
  order: { type: Number, required: true }
});

module.exports = (quizDb) => quizDb.model('Quiz', quizSchema);