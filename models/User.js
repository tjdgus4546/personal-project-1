const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  gameSessions: [
    {
      type: Schema.Types.ObjectId,
      ref: "GameSession",
    },
  ],
});

module.exports = (userDb) => userDb.model('User', userSchema);