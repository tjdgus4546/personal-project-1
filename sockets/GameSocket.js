module.exports = (io, app) => {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const ChatLog = require('../models/ChatLog')(quizDb);
  const { ObjectId } = require('mongoose').Types;

  io.on('connection', (socket) => {

    socket.on('joinSession', async ({ sessionId, username }) => {
      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);

      if (!ObjectId.isValid(sessionId)) return;
      const session = await GameSession.findById(sessionId);
      if (!session) return;

      let updated = false;

      // 이미 참가한 유저인지 확인
      const existing = session.players.find(p => p.username === username);
      if (!existing) {
        session.players.push({
          username,
          score: 0,
          answered: {}
        });
        updated = true;
      }

      // 방장 지정 (세션 생성자) → 제일 먼저 들어온 사람을 host로 지정
      if (!session.host || session.host === '__NONE__') {
        session.host = username;
        updated = true;
      }

      if (updated) {
        await session.save();
      }

      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.username = username;
      socket.firstCorrectUser = null;

      io.to(sessionId).emit('chat', {
        user: 'system',
        message: `${username} 입장`
      });

      // 점수판 전송 (최신 session 상태 기준)
      const latestSession = await GameSession.findById(sessionId); // 최신화
      io.to(sessionId).emit('scoreboard', {
        players: latestSession.players.map(p => ({
          username: p.username,
          score: p.score
        }))
      });

      // 스킵투표 인원수 공개
      io.to(sessionId).emit('voteSkipUpdate', {
        votes: session.skipVotes.length,
        total: session.players.length
      });

      // 대기 상태 알림
      io.to(sessionId).emit('waiting-room', {
        host: session.host || '__NONE__',
        players: session.players.map(p => p.username),
        isStarted: session.isStarted || false
        });

      socket.emit('host-updated', {
        host: session.host || '__NONE__'
      });

      });

    socket.emit('session-ready');

    socket.on('disconnect', async () => {
      const { sessionId, username } = socket;
      if (!sessionId || !username) return;

      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);

      // 3초 후에도 같은 사용자가 다시 접속해 있지 않다면 제거
      setTimeout(async () => {
        const socketsInRoom = await io.in(sessionId).fetchSockets();
        const stillConnected = socketsInRoom.some(s => s.username === username);

        if (stillConnected) {
          return;
        }

        const session = await GameSession.findById(sessionId);
        if (!session) return;

        // 🔻 해당 유저 제거
        session.players = session.players.filter(p => p.username !== username);
        session.markModified('players');

        // 🔻 host였으면 새로 지정
        if (session.host === username) {
          if (session.players.length > 0) {
            session.host = session.players[0].username;
          } else {
            session.host = '__NONE__';
          }
        }

        await session.save();

        // 🔻 공통: 퇴장 메시지
        io.to(sessionId).emit('chat', {
          user: 'system',
          message: `${username} 퇴장`
        });

        // 🔻 분기 처리
        if (session.isStarted) {
          // ✅ 게임 중: 점수판 갱신
          io.to(sessionId).emit('scoreboard', {
            players: session.players.map(p => ({
              username: p.username,
              score: p.score
            }))
          });

          io.to(sessionId).emit('host-updated', {
            host: session.host || '__NONE__'
          });

        } else {
          // ✅ 대기 상태: 대기룸 갱신
          io.to(sessionId).emit('waiting-room', {
            host: session.host || '__NONE__',
            players: session.players.map(p => p.username),
            isStarted: false
          });
        }

      }, 3000); // 3초 후에도 접속 안 되어 있으면 제거
    });


    
    socket.on('startGame', async ({ sessionId, username }) => {
      if (!ObjectId.isValid(sessionId)) return;
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
        host: session.host || '__NONE__',
        questionStartAt: session.questionStartAt,
        }

      ); // 클라이언트에서 UI 전환

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
    if (!ObjectId.isValid(sessionId)) return;
    const session = await GameSession.findById(sessionId);
    if (!session || !session.isActive) return;

    const playerIndex = session.players.findIndex(p => p.username === username);
    if (playerIndex === -1) return;

    const player = session.players[playerIndex];

    if (!player) return;

    const qIndex = String(session.currentQuestionIndex);
    if (player.answered?.[qIndex]) return; //

    if (!app.firstCorrectUsers) {
      app.firstCorrectUsers = {};
    }

    const isFirst = !app.firstCorrectUsers[sessionId];
    if (isFirst) {
      app.firstCorrectUsers[sessionId] = username;
      player.score += 2;
    } else {
      player.score += 1;
    }

    // 정답 기록

    // player.answered[qIndex] = true;
    session.set(`players.${playerIndex}.answered.${qIndex}`, true);
    session.markModified('players');
    await session.save();

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

    io.to(sessionId).emit('correct', { username });
    io.to(sessionId).emit('scoreboard', {
      players: session.players.map(p => ({
        username: p.username,
        score: p.score
      }))
    });
  });

  // 스킵투표
  socket.on('voteSkip', async ({ sessionId, username }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await GameSession.findById(sessionId);
    if (!session || !session.isActive) return;

    if (!session.skipVotes.includes(username)) {
      session.skipVotes.push(username);
      await session.save();

      io.to(sessionId).emit('skipVoteUpdate', {
        total: session.players.length,
        votes: session.skipVotes.length
      });

      const totalPlayers = session.players.length;
      const voteRatio = session.skipVotes.length / totalPlayers;

      if (voteRatio >= 0.5) {
        await revealAnswer(sessionId, io, app)();
      }
    }
  });

  // //방장 강제스킵
  socket.on('forceSkip', async ({ sessionId, username }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await GameSession.findById(sessionId);
    if (!session || session.host !== username) return;

    await revealAnswer(sessionId, io, app)();
  });


  socket.on('revealAnswer', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await GameSession.findById(sessionId);
    if (!session) return;

    if (session.revealedAt) return;

    const quiz = await Quiz.findById(session.quizId).lean();
    const index = session.currentQuestionIndex;
    const question = quiz.questions[index];
    if (!question) return;

    session.revealedAt = new Date();
    await session.save();

    // 모든 참가자에게 정답 전송
    io.to(sessionId).emit('answerReveal', {
      answers: question.answers,
      index,
      revealedAt: session.revealedAt
    });
  });

  // 정답공개후 다음 문제로 넘기기
  socket.on('nextQuestion', async ({ sessionId, username }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await GameSession.findById(sessionId);
    if (!session || session.host !== username) return;

    if (app.firstCorrectUsers) {
      delete app.firstCorrectUsers[sessionId];
    }

    await goToNextQuestion(sessionId, io, app);
  });
  
  });

  // 문제 종료 후 정답 공개
  function revealAnswer(sessionId, io, app) {
    return async () => {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await GameSession.findById(sessionId);
      if (!session || !session.isActive) return;

      // 중복투표 방지
      if (session.revealedAt) return;

      const quiz = await Quiz.findById(session.quizId).lean();
      const question = quiz.questions[session.currentQuestionIndex];

      const revealedAt = new Date();

      session.revealedAt = revealedAt;
      await session.save();

      io.to(sessionId).emit('answerReveal', {
        answers: question.answers,
        index: session.currentQuestionIndex,
        revealedAt,
      });
    };
  }

  //문제 타이머 함수
  async function goToNextQuestion(sessionId, io, app) {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  if (!ObjectId.isValid(sessionId)) return;
  const session = await GameSession.findById(sessionId);
  if (!session) return;

  const quiz = await Quiz.findById(session.quizId).lean();

  session.revealedAt = null;
  session.currentQuestionIndex += 1;
  session.skipVotes = [];
  session.questionStartAt = new Date();

  // 모든 문제를 완료한 경우
  if (session.currentQuestionIndex >= quiz.questions.length) {
    session.isActive = false;
    session.endedAt = new Date()
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
    totalPlayers: session.players.length,
  });
};

};