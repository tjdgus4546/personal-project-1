const mongoose = require('mongoose');
const { Schema } = mongoose;

const playerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  score: { type: Number, default: 0 },
  correctAnswersCount: { type: Number, default: 0 },
  answered: { type: Schema.Types.Mixed, default: {} },
  connected: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  socketId: { type: String, default: null },
});

const gameSessionSchema = new Schema({
  quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
  players: [playerSchema],
  currentQuestionIndex: { type: Number, default: 0 },
  correctUsers: {type: Schema.Types.Mixed, default: {}},
  startedAt: { type: Date, default: Date.now },
  questionStartAt: { type: Date, default: null },
  revealedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  inviteCode: { type: String, unique: true },
  isStarted: { type: Boolean, default: false },
  host: { type: Schema.Types.ObjectId, ref: 'User' },
  skipVotes: {type: [String], default: []},
  endedAt: { type: Date, default: null, index: { expires: '6h' } },
});

module.exports = (quizDb) => {
  return quizDb.models.GameSession || quizDb.model('GameSession', gameSessionSchema, 'game_sessions');
};
