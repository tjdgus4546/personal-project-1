// config/DB.js
require('dotenv').config();  // .env 파일 불러오기
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const connectionOptions = {
      autoIndex: true, // 🔧 인덱스 자동 생성 활성화
      maxPoolSize: 50, // 🔧 연결 풀 크기 증가 (기본값: 10)
      minPoolSize: 5,  // 🔧 최소 연결 유지
      serverSelectionTimeoutMS: 30000, // 🔧 서버 선택 타임아웃 (5초 → 30초)
      socketTimeoutMS: 60000, // 🔧 소켓 타임아웃 (45초 → 60초)
      connectTimeoutMS: 30000, // 🔧 초기 연결 타임아웃
      heartbeatFrequencyMS: 10000, // 🔧 하트비트 주기 (10초마다 연결 체크)
      retryWrites: true, // 🔧 쓰기 작업 재시도
      retryReads: true, // 🔧 읽기 작업 재시도
      bufferCommands: false, // 🔧 버퍼링 비활성화 (연결 끊기면 즉시 에러)
    };

    // 사용자 DB 연결
    const userDb = await mongoose.createConnection(process.env.USER_DB_URI, connectionOptions);
    console.log('✅ UserDB 연결 성공');

    // 퀴즈 DB 연결
    const quizDb = await mongoose.createConnection(process.env.QUIZ_DB_URI, connectionOptions);
    console.log('✅ QuizDB 연결 성공');

    // 🔄 연결 끊김 감지 및 재연결 처리
    userDb.on('disconnected', () => {
      console.warn('⚠️ UserDB 연결 끊김 - 재연결 시도 중...');
    });

    userDb.on('reconnected', () => {
      console.log('✅ UserDB 재연결 성공');
    });

    userDb.on('error', (err) => {
      console.error('❌ UserDB 에러:', err.message);
    });

    quizDb.on('disconnected', () => {
      console.warn('⚠️ QuizDB 연결 끊김 - 재연결 시도 중...');
    });

    quizDb.on('reconnected', () => {
      console.log('✅ QuizDB 재연결 성공');
    });

    quizDb.on('error', (err) => {
      console.error('❌ QuizDB 에러:', err.message);
    });

    return { userDb, quizDb };
  } catch (err) {
    console.error('❌ MongoDB 연결 오류:', err.message);
    console.error('상세:', err);
    process.exit(1);
  }
};

module.exports = connectDB;
