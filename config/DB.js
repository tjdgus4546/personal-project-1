// config/DB.js
require('dotenv').config();  // .env 파일 불러오기
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // 🚀 Flex 티어 최적화 설정
    const connectionOptions = {
      autoIndex: true, // 🔧 인덱스 자동 생성
      maxPoolSize: 100, // 🔧 연결 풀 크기 대폭 증가 (Flex는 더 많은 연결 지원)
      minPoolSize: 20,  // 🔧 최소 연결 유지 (빠른 응답을 위해)
      serverSelectionTimeoutMS: 5000, // 🔧 서버 선택 타임아웃 (Flex는 빠름)
      socketTimeoutMS: 30000, // 🔧 소켓 타임아웃
      connectTimeoutMS: 5000, // 🔧 초기 연결 타임아웃 (Flex는 빠른 연결)
      heartbeatFrequencyMS: 3000, // 🔧 하트비트 주기 (더 자주 체크)
      retryWrites: true, // 🔧 쓰기 작업 재시도
      retryReads: true, // 🔧 읽기 작업 재시도
      bufferCommands: false, // 🔧 버퍼링 비활성화 (Flex는 안정적이므로 즉시 에러 처리)
      maxIdleTimeMS: 30000, // 🔧 유휴 연결 타임아웃
      waitQueueTimeoutMS: 2000, // 🔧 연결 대기 큐 타임아웃
      compressors: ['zlib'], // 🔧 네트워크 압축
      maxConnecting: 10, // 🔧 동시 연결 시도 수
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
