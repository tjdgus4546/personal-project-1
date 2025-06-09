const mongoose = require('mongoose');
const { Schema } = mongoose;

const playerSchema = new Schema({
  username: String,
  score: { type: Number, default: 0 },
  answered: {
    type: Schema.Types.Mixed,
    default: {}
  }
});

const gameSessionSchema = new Schema({
  quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
  players: [playerSchema],
  currentQuestionIndex: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  inviteCode: { type: String, unique: true },
  started: { type: Boolean, default: false },
  host: { type: String, required: true },
});

module.exports = (quizDb) => quizDb.model('GameSession', gameSessionSchema, 'game_sessions');