require('dotenv').config();
const express = require('express');
const path = require('path');
const connectDB = require('./config/DB');
const authRoutes = require('./routes/AuthRoutes');
const quizRoutes = require('./routes/QuizRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ MongoDB 연결
connectDB().then(({ userDb, quizDb }) => {
  app.set('userDb', userDb);  // User DB를 전역에서 사용 가능하도록 설정
  app.set('quizDb', quizDb);  // Chat DB를 전역에서 사용 가능하도록 설정
}).catch(err => {
  console.error('DB 연결 실패:', err);
  process.exit(1);
});

// 미들웨어 설정
app.use('/auth', authRoutes);

// 라우트 설정
app.use('/', authRoutes);
app.use('/', quizRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});