const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  username: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const chatSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, required: true, unique: true },
  messages: [messageSchema]
});

module.exports = (quizDb) => quizDb.model('ChatLog', chatSchema, 'chat_logs');