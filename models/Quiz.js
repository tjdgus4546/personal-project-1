// models/Chat.js
const mongoose = require('mongoose');

// models/Question.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    options: [String],
    points: { type: Number, default: 10 }
});

module.exports = mongoose.model('Question', questionSchema);
