module.exports = (io, app) => {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const ChatLog = require('../models/ChatLog')(quizDb);

  const timers = {}; // 세션별 타이머 저장

  io.on('connection', (socket) => {
    console.log('[Socket] 연결됨:', socket.id);

    socket.on('joinSession', async ({ sessionId, username }) => {
      const session = await GameSession.findById(sessionId);
      if (!session) return;

      socket.join(sessionId);

      //세션에 플레이어가 있는지 체크후 없으면 세션에 플레이어 추가
      let updated = false;
      const alreadyJoined = session.players.some(p => p.username === username);
      if (!alreadyJoined) {
        session.players.push({
          username,
          score: 0,
          answered: {}
        });
        updated = true;
      }

      // 방장 지정 (세션 생성자) → 제일 먼저 들어온 사람을 host로 지정
      if (!session.host) {
        session.host = username;
        updated = true;
      }

      if (updated) {
        await session.save();
        console.log(`[JOINED] ${username} → 세션에 등록됨`);
      }

      io.to(sessionId).emit('chat', {
        user: 'system',
        message: `${username} 입장`
      });

      // ✅ 점수판 전송 (최신 session 상태 기준)
      const latestSession = await GameSession.findById(sessionId); // 최신화
      io.to(sessionId).emit('scoreboard', {
        players: latestSession.players.map(p => ({
          username: p.username,
          score: p.score
        }))
      });

      // 대기 상태 알림
      io.to(sessionId).emit('waiting-room', {
        host: session.host,
        players: session.players.map(p => p.username),
        isStarted: session.isStarted || false
        });
      });
    
      socket.on('startGame', async ({ sessionId, username }) => {
        const session = await GameSession.findById(sessionId);
        if (!session || session.isStarted) return;
        
        if (session.host !== username) return; // 방장만 시작 가능
        
        session.isStarted = true;
        session.isActive = true;
        session.currentQuestionIndex = -1; // 첫 문제 준비
        await session.save();
        
        const quiz = await Quiz.findById(session.quizId).lean();

        io.to(sessionId).emit('game-started', { quiz }); // 클라이언트에서 UI 전환

        startQuestionTimer(sessionId, io, app); // 타이머 시작
    });

    // 일반 채팅은 DB에 로그 저장
    socket.on('chatMessage', async ({ sessionId, username, message }) => {
      if (!message?.trim()) return;

    const ChatSessionLog = require('../models/ChatLog')(quizDb);

      await ChatSessionLog.updateOne(
        { sessionId },
        {
          $push: {
            messages: {
              username,
              message,
              createdAt: new Date()
            }
          }
        },
        { upsert: true }
      );

      // 모든 유저에게 브로드캐스트
      io.to(sessionId).emit('chat', { user: username, message });
    });

    // 클라이언트에서 정답 판별 후 전송하는 이벤트
    socket.on('correct', async ({ sessionId, username }) => {
      const session = await GameSession.findById(sessionId);
      if (!session || !session.isActive) return;

      const player = session.players.find(p => p.username === username);
      const qIndex = String(session.currentQuestionIndex);
      if (!player || player.answered?.[qIndex]) return;

        if (player.answered?.[qIndex]) {
        // 이미 정답 맞춘 경우: 메시지 안 보내거나 isNew: false
        return; // 또는 아래처럼 보내고 클라이언트에서 무시하게
        // socket.emit('correct-ack', { isNew: false });
      }

      // 정답인정
      player.score += 1;
      player.answered[qIndex] = true;
      session.markModified('players');
      await session.save();

      io.to(sessionId).emit('correct', { username });
      io.to(sessionId).emit('scoreboard', {
        players: session.players.map(p => ({
          username: p.username,
          score: p.score
        }))
      });
    });

    socket.on('disconnect', () => {
      console.log('[Socket] 연결 해제:', socket.id);
    });
  });

  // 문제 타이머 함수
  function startQuestionTimer(sessionId, io, app) {
    const interval = setInterval(async () => {
      const session = await GameSession.findById(sessionId);
      if (!session || !session.isActive) {
        clearInterval(interval);
        delete timers[sessionId];
        return;
      }

      const quiz = await Quiz.findById(session.quizId).lean();
      io.to(sessionId).emit('game-started', { quiz });
      session.currentQuestionIndex += 1;

      if (session.currentQuestionIndex >= quiz.questions.length) {
        session.isActive = false;
        await session.save();

        io.to(sessionId).emit('end', { message: '퀴즈 종료!' });
        clearInterval(interval);
        delete timers[sessionId];
      } else {
        await session.save();
        io.to(sessionId).emit('next', { index: session.currentQuestionIndex });
      }
    }, 90000); // 90초
    timers[sessionId] = interval;
  }
};
