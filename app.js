require('dotenv').config();
const express = require('express');
const path = require('path');
const connectDB = require('./config/DB');
const authRoutes = require('./routes/AuthRoutes');
const quizRoutes = require('./routes/QuizRoutes');
const gameRoutes = require('./routes/GameRoutes');
const quizApiRoutesFactory = require('./routes/QuizApiRoutes');


const app = express();
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app); // 기존 app을 감싼다
const io = new Server(server);        // 소켓 서버 생성

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ MongoDB 연결
connectDB().then(({ userDb, quizDb }) => {
  app.set('userDb', userDb);  // User DB를 전역에서 사용 가능하도록 설정
  app.set('quizDb', quizDb);  // Chat DB를 전역에서 사용 가능하도록 설정
  app.set('io', io); // app 전체에서 io 접근 가능하도록 저장
  
  const quizApiRoutes = quizApiRoutesFactory(quizDb);
  
  // 미들웨어 설정
  app.use('/auth', authRoutes);
  // 라우트 설정
  app.use('/', authRoutes);
  app.use('/', quizRoutes);
  app.use('/api', quizApiRoutes);
  app.use('/game', gameRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  // 소켓 로직 파일 연결
  require('./sockets/GameSocket')(io, app);

  // 서버 시작
  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

}).catch(err => {
  console.error('DB 연결 실패:', err);
  process.exit(1);
});