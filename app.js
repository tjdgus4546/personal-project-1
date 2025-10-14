require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const connectDB = require('./config/DB');
const authRoutes = require('./routes/AuthRoutes');
const naverAuthRoutes = require('./routes/NaverAuthRoutes');
const quizRoutes = require('./routes/QuizRoutes');
const gameRoutes = require('./routes/GameRoutes');
const adminRoutes = require('./routes/AdminRoutes');
const adminSetupRoutes = require('./routes/AdminSetupRoutes');
const authenticateToken = require('./middlewares/AuthMiddleware');
const quizApiRoutesFactory = require('./routes/QuizApiRoutes');


const app = express();
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // HTTPS 환경이므로 true 설정
    httpOnly: true,
    maxAge: 30 * 60 * 1000 // 30분
  },
  proxy: true // 프록시/로드밸런서 환경에서도 세션 유지
}));

// ✅ MongoDB 연결
connectDB().then(({ userDb, quizDb }) => {
  app.set('userDb', userDb);  // User DB를 전역에서 사용 가능하도록 설정
  app.set('quizDb', quizDb);  // Chat DB를 전역에서 사용 가능하도록 설정
  app.set('io', io); // app 전체에서 io 접근 가능하도록 저장
  
  const { publicRouter, privateRouter } = quizApiRoutesFactory(quizDb);

  // 라우트 설정
  app.use('/auth', authRoutes);
  app.use('/auth', naverAuthRoutes);
  app.use('/', authRoutes);
  app.use('/', quizRoutes);
  app.use('/api', publicRouter); // 인증이 필요없는 API
  app.use('/api', authenticateToken, privateRouter); // 인증이 필요한 API
  app.use('/game', authenticateToken, gameRoutes);
  app.use('/admin-setup', adminSetupRoutes); // 관리자 권한 부여 (authenticateToken으로 보호)
  app.use('/admin', adminRoutes); // 관리자 페이지 (checkAdmin 미들웨어로 보호)

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