require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/DB');
const authRoutes = require('./routes/AuthRoutes');
const naverAuthRoutes = require('./routes/NaverAuthRoutes');
const googleAuthRoutes = require('./routes/GoogleAuthRoutes');
const quizRoutes = require('./routes/QuizRoutes');
const gameRoutes = require('./routes/GameRoutes');
const adminRoutes = require('./routes/AdminRoutes');
const adminSetupRoutes = require('./routes/AdminSetupRoutes');
const commentRoutes = require('./routes/CommentRoutes');
const contactRoutes = require('./routes/ContactRoutes');
const authenticateToken = require('./middlewares/AuthMiddleware');
const quizApiRoutesFactory = require('./routes/QuizApiRoutes');


const app = express();
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);

// Socket.IO 서버 설정 (CORS 포함)
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://playcode.gg', 'https://www.playcode.gg']
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  // 연결 안정성을 위한 추가 설정
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

// Trust proxy 설정 (Nginx 등 리버스 프록시 뒤에서 실행될 때 필요)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // 첫 번째 프록시를 신뢰
}

// HTTPS 강제 리다이렉트 (프로덕션)
// ⚠️ EC2에 SSL 인증서가 없어서 임시 비활성화
// TODO: SSL 인증서 추가하면 다시 활성화
/*
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(301, `https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
*/

app.use(express.static(path.join(__dirname, 'public'), {
  index: false // index.html 자동 제공 비활성화 (명시적 라우트 사용)
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Rate Limiting 설정
// 1. 전역 제한: 모든 요청에 적용 (느슨하게)
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 100, // 1분당 최대 100개 요청
  message: '너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true, // RateLimit-* 헤더 반환
  legacyHeaders: false, // X-RateLimit-* 헤더 비활성화
});

// 2. API 제한: 일반 API 엔드포인트 (중간)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 60, // 1분당 최대 60개 요청
  message: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. 인증 제한: 로그인/회원가입 (엄격하게)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 15분당 최대 5개 요청
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 전역 limiter 적용
app.use(globalLimiter);

app.use(session({
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || process.env.USER_DB_URI,
    dbName: 'userdb',
    collectionName: 'sessions',
    ttl: 30 * 60, // 30분 (초 단위)
    autoRemove: 'native' // MongoDB TTL 인덱스로 자동 삭제
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // 프로덕션에서만 true
    httpOnly: true,
    sameSite: 'lax', // OAuth 리다이렉트 시 쿠키 전송 허용
    maxAge: 30 * 60 * 1000 // 30분
  },
  proxy: process.env.NODE_ENV === 'production' // 프로덕션에서만 true
}));

// ✅ MongoDB 연결
connectDB().then(({ userDb, quizDb }) => {
  app.set('userDb', userDb);  // User DB를 전역에서 사용 가능하도록 설정
  app.set('quizDb', quizDb);  // Chat DB를 전역에서 사용 가능하도록 설정
  app.set('io', io); // app 전체에서 io 접근 가능하도록 저장

  // 🛡️ 봇 차단 미들웨어 적용 (Rate Limiter 다음, 다른 미들웨어보다 먼저)
  const botBlocker = require('./middlewares/BotBlocker');
  app.use(botBlocker(userDb));

  // 접속 로그 수집 미들웨어 (실제 페이지 조회만 카운트)
  const AccessLog = require('./models/AccessLog')(userDb);
  app.use((req, res, next) => {
    // ✅ quiz-edit API 요청은 현재 접속자 집계를 위해 로그에 기록
    const isQuizEditAPI =
      (req.method === 'PUT' || req.method === 'POST') &&
      (req.path.match(/^\/api\/quiz\/[^\/]+\/question/) ||
       req.path.match(/^\/api\/quiz\/[^\/]+\/questions$/));

    // quiz-edit API가 아니면 기존 로직 적용
    if (!isQuizEditAPI) {
      // ✅ 페이지뷰 = 실제 HTML 페이지를 조회한 경우만 카운트
      // GET 요청이 아니면 제외
      if (req.method !== 'GET') {
        return next();
      }

      // 정적 파일, API, 관리자 페이지 등은 제외
      if (
        req.path.startsWith('/css') ||
        req.path.startsWith('/js') ||
        req.path.startsWith('/images') ||
        req.path.startsWith('/socket.io') ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/auth/') ||
        req.path.startsWith('/game/') ||
        req.path.startsWith('/admin') ||
        req.path === '/favicon.ico'
      ) {
        return next();
      }
    }

    // ✅ 화이트리스트: 실제 페이지만 카운트 (또는 quiz-edit API)
    const isPageView =
      isQuizEditAPI ||                                       // quiz-edit API 요청
      req.path === '/' ||                                    // 메인 페이지
      req.path === '/my-page' ||                             // 마이페이지
      req.path === '/edit-profile' ||                        // 내 정보 수정
      req.path === '/quiz/my-list' ||                        // 나의 퀴즈 목록
      req.path === '/quiz/edit' ||                           // 퀴즈 편집
      req.path === '/quiz/init' ||                           // 퀴즈 생성
      req.path.match(/^\/quiz\/[a-f0-9]{24}$/) ||           // 게임 세션 (/quiz/:sessionId)
      req.path.endsWith('.html');                            // 기타 HTML 페이지

    if (!isPageView) {
      return next();
    }

    // 🔒 응답이 완료되었을 때 로그 저장 (중복 방지)
    res.on('finish', () => {
      // 이미 처리된 요청은 건너뛰기
      if (req._accessLogProcessed) {
        return;
      }
      req._accessLogProcessed = true;

      // 비동기로 로그 저장
      const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();

      AccessLog.create({
        ip,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        userId: req.user?.id || null
      }).catch(error => {
        console.error('Access log error:', error);
      });
    });

    next();
  });
  
  const { publicRouter, privateRouter } = quizApiRoutesFactory(quizDb);

  // authLimiter를 라우트에서 사용할 수 있도록 app에 저장
  app.set('authLimiter', authLimiter);
  app.set('apiLimiter', apiLimiter);

  // 라우트 설정
  app.use('/auth', authRoutes);
  app.use('/auth', naverAuthRoutes);
  app.use('/auth', googleAuthRoutes);
  app.use('/', authRoutes);
  app.use('/', quizRoutes);
  app.use('/api', apiLimiter, publicRouter); // API에 중간 제한
  app.use('/api', apiLimiter, authenticateToken, privateRouter);
  app.use('/api', apiLimiter, commentRoutes); // 댓글 라우트 (GET은 인증 불필요, POST는 인증 필요)
  app.use('/api', contactRoutes); // 문의하기 (자체 Rate Limiter 사용)
  app.use('/game', apiLimiter, authenticateToken, gameRoutes);
  app.use('/admin-setup', adminSetupRoutes); // 관리자 권한 부여 (authenticateToken으로 보호)
  app.use('/admin', adminRoutes); // 관리자 페이지 (checkAdmin 미들웨어로 보호)

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  // 소켓 로직 파일 연결
  const gameSocketMonitor = require('./sockets/GameSocket')(io, app);

  // ===== 에러 핸들러 (모든 라우트 정의 후 마지막에 배치) =====

  // 404 핸들러 - 정의되지 않은 모든 라우트 처리
  app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });

  // 500 핸들러 - 서버 에러 처리
  app.use((err, req, res, next) => {
    console.error('Server error:', err);

    if (process.env.NODE_ENV === 'production') {
      // 프로덕션: 에러 정보 숨김
      res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
    } else {
      // 개발 모드: 에러 메시지를 URL 파라미터로 전달
      const errorMsg = encodeURIComponent(err.message || 'Unknown error');
      res.status(500).redirect(`/500.html?error=${errorMsg}`);
    }
  });

  // 서버 시작
  server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

}).catch(err => {
  console.error('DB 연결 실패:', err);
  process.exit(1);
});