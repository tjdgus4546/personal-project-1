// config/DB.js
require('dotenv').config();  // .env 파일 불러오기
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // 사용자 DB 연결
    const userDb = await mongoose.createConnection(process.env.USER_DB_URI, {
    });
    console.log('UserDB 연결 성공');

    // 퀴즈 DB 연결
    const quizDb = await mongoose.createConnection(process.env.QUIZ_DB_URI, {
    });
    console.log('QuizDB 연결 성공');

    return { userDb, quizDb };
  } catch (err) {
    console.error('MongoDB 연결 오류:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
