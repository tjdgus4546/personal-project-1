const mongoose = require('mongoose');
const { Schema } = mongoose;

const messageSchema = new Schema({
  username: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const chatSessionSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, required: true, unique: true },
  messages: [messageSchema]
});

module.exports = (quizDb) => quizDb.model('ChatSessionLog', chatSessionSchema, 'chat_session_logs');