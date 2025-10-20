// config/DB.js
require('dotenv').config();  // .env 파일 불러오기
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const connectionOptions = {
      autoIndex: true, // 🔧 인덱스 자동 생성 활성화
      maxPoolSize: 50, // 🔧 연결 풀 크기 증가 (기본값: 10)
      minPoolSize: 5,  // 🔧 최소 연결 유지
      serverSelectionTimeoutMS: 5000, // 🔧 서버 선택 타임아웃
      socketTimeoutMS: 45000, // 🔧 소켓 타임아웃
    };

    // 사용자 DB 연결
    const userDb = await mongoose.createConnection(process.env.USER_DB_URI, connectionOptions);
    console.log('UserDB 연결 성공');

    // 퀴즈 DB 연결
    const quizDb = await mongoose.createConnection(process.env.QUIZ_DB_URI, connectionOptions);
    console.log('QuizDB 연결 성공');

    return { userDb, quizDb };
  } catch (err) {
    console.error('MongoDB 연결 오류:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
