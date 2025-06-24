module.exports = (io, app) => {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const ChatLog = require('../models/ChatLog')(quizDb);

  const timers = {}; // 세션별 타이머 저장

  io.on('connection', (socket) => {

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
      session.questionStartAt = new Date();
      session.currentQuestionIndex = 0; // 첫 문제 준비
      await session.save();
        
      const quiz = await Quiz.findById(session.quizId).lean();

      io.to(sessionId).emit('game-started', {
        quiz,
        host: session.host,
        questionStartAt: session.questionStartAt,
      }); // 클라이언트에서 UI 전환

    });

    // 일반 채팅은 DB에 로그 저장
    socket.on('chatMessage', async ({ sessionId, username, message }) => {
      if (!message?.trim()) return;

        const ChatLog = require('../models/ChatLog')(quizDb);

      await ChatLog.updateOne(
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

      await ChatLog.findOneAndUpdate(
        { sessionId },
        {
          $push: {
            messages: {
              username,
              message: `${username}님이 정답을 맞혔습니다! 🎉`,
              createdAt: new Date()
            }
          }
        },
        { upsert: true, new: true }
      );

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

    });

  // 스킵투표
  socket.on('voteSkip', async ({ sessionId, username }) => {
    const session = await GameSession.findById(sessionId);
    if (!session || !session.isActive) return;

    if (!session.skipVotes.includes(username)) {
      session.skipVotes.push(username);
      await session.save();

      const totalPlayers = session.players.length;
      const voteRatio = session.skipVotes.length / totalPlayers;

      if (voteRatio >= 0.3) {
        await goToNextQuestion(sessionId, io, app);
      }
    }
  });

  // //방장 강제스킵
  socket.on('forceSkip', async ({ sessionId, username }) => {
    const session = await GameSession.findById(sessionId);
    if (!session || session.host !== username) return;

    await goToNextQuestion(sessionId, io, app);
  });


  socket.on('revealAnswer', async ({ sessionId }) => {
    const session = await GameSession.findById(sessionId).lean();
    if (!session) return;

    const quiz = await Quiz.findById(session.quizId).lean();
    const index = session.currentQuestionIndex;
    const question = quiz.questions[index];
    if (!question) return;

    // 모든 참가자에게 정답 전송
    io.to(sessionId).emit('answerReveal', {
      answer: question.answer,
      index
    });


  });

  // 정답공개후 다음 문제로 넘기기
  socket.on('nextQuestion', async ({ sessionId, username }) => {
    const session = await GameSession.findById(sessionId);
    if (!session || session.host !== username) return;

    await goToNextQuestion(sessionId, io, app);
  });
  
  });


  //초수계산
  // async function startQuestionTimer(sessionId, io, app) {
  
  // const quizDb = app.get('quizDb');
  // const GameSession = require('../models/GameSession')(quizDb);
  // const Quiz = require('../models/Quiz')(quizDb);

  // const session = await GameSession.findById(sessionId);
  // if (!session || !session.isActive) return;
  
  // const quiz = await Quiz.findById(session.quizId).lean();
  // const currentQuestion = quiz.questions[session.currentQuestionIndex];
  // const timeLimit = currentQuestion.timeLimit || 90;
    
  // const interval = setTimeout(async () => {
  //   //정답공개 5초
  //    io.to(sessionId).emit('reveal-answer', {
  //     answer: currentQuestion.answer,
  //     order: session.currentQuestionIndex + 1
  //    });
  //    setTimeout(() => {
  //      goToNextQuestion(sessionId, io, app);
  //    }, 5000);
  // }, timeLimit* 1000);

  // timers[sessionId] = interval;
  // }

  //문제 타이머 함수
  async function goToNextQuestion(sessionId, io, app) {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  const session = await GameSession.findById(sessionId);
  if (!session) return;

  const quiz = await Quiz.findById(session.quizId).lean();

  session.currentQuestionIndex += 1;
  session.skipVotes = [];
  session.questionStartAt = new Date();

  // 모든 문제를 완료한 경우
  if (session.currentQuestionIndex >= quiz.questions.length) {
    session.isActive = false;
    await session.save();

    // 완료된 게임 수 증가
    await Quiz.findByIdAndUpdate(
      session.quizId,
      { $inc: { completedGameCount: 1 } }
    );

    io.to(sessionId).emit('end', { message: '퀴즈 종료!' });
    return;
  }

  await session.save();

  io.to(sessionId).emit('next', {
    index: session.currentQuestionIndex,
    questionStartAt: session.questionStartAt,
  });
}



};