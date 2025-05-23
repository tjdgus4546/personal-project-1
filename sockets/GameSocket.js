module.exports = (io, app) => {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  const timers = {}; // 세션별 타이머 저장

  io.on('connection', (socket) => {
    console.log('[Socket] 연결됨:', socket.id);

    socket.on('joinSession', async ({ sessionId, username }) => {
    const session = await GameSession.findById(sessionId);

    if (!session) return;
      socket.join(sessionId);
      const alreadyJoined = session.players.some(p => p.username === username);

    if (!alreadyJoined) {
        session.players.push({ username, score: 0, answered: {} });
        await session.save();
        console.log(`[JOINED] ${username} → 세션에 등록됨`);
    }
    
      io.to(sessionId).emit('chat', { user: 'system', message: `${username} 입장` });

      // 타이머가 없으면 시작
      if (!timers[sessionId]) {
        startQuestionTimer(sessionId, io, app);
      }
    });

    socket.on('chatMessage', async ({ sessionId, username, message }) => {
      const session = await GameSession.findById(sessionId);
      if (!session || !session.isActive) return;

      const quiz = await Quiz.findById(session.quizId).lean();
      const question = quiz.questions[session.currentQuestionIndex];
      const answer = question.answer.trim().toLowerCase();

      // 이미 정답 맞춘 유저는 무시
      const player = session.players.find(p => p.username === username);
      if (!player) return;
      if (!player.answered) player.answered = {};

      const alreadyAnswered = player.answered[session.currentQuestionIndex];
      if (alreadyAnswered) return;

      // 정답 확인
      if (message.trim().toLowerCase() === answer) {
        // 점수 증가
        player.score += 1;
        player.answered[session.currentQuestionIndex] = true;
        await session.save();

        io.to(sessionId).emit('correct', { username });
      } else {
        io.to(sessionId).emit('chat', { user: username, message });
      }
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
