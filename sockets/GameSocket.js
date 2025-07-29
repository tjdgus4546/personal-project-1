const jwt = require('jsonwebtoken');
const cookieParser = require('socket.io-cookie-parser');
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = (io, app) => {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const ChatLog = require('../models/ChatLog')(quizDb);
  const { safeFindSessionById, safeSaveSession } = require('../utils/sessionHelpers');
  const { safeFindQuizById } = require('../utils/quizHelpers');
  const { ObjectId } = require('mongoose').Types;

  io.use(cookieParser());

  io.use(async (socket, next) => {
    const token = socket.request.cookies.accessToken;

    if (!token) {
      console.warn('Socket.IO: No access token found in cookies.');
      return next(new Error('Authentication error: No token provided.'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      next();
    } catch (err) {
      console.error('Socket.IO: JWT verification failed:', err.message);
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  io.on('connection', (socket) => {

    socket.on('joinSession', async ({ sessionId }) => {
      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);
      
      const userId = socket.userId;
      const username = socket.username;

      if (!ObjectId.isValid(sessionId)) return;
      
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session) return;
      
      let updated = false;
      let player = session.players.find(p => p.userId.toString() === userId.toString());
      
      if (!player) {
        session.players.push({
          userId,
          username,
          score: 0,
          correctAnswersCount: 0,
          answered: {},
          connected: true,
          lastSeen: new Date(),
          socketId: socket.id,
        });
        updated = true;
      } else {
        // 재접속 시 갱신
        player.connected = true;
        player.lastSeen = new Date();
        player.socketId = socket.id;
        updated = true;
      }
      
      // 방장 지정 (세션 생성자) → 제일 먼저 들어온 사람을 host로 지정
      if (!session.host || session.host.toString() === '__NONE__') {
        session.host = userId;
        updated = true;
      }

      if (updated) {
        const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - joinSession');
          return;
        }
      }

      const hostUser = session.players.find(p => {
        if (!session.host) return false;
        return p.userId.toString() === session.host.toString();
      });
      
      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.username = username;
      socket.userId = userId;
      socket.firstCorrectUser = null;

      // 점수판 전송 (최신 session 상태 기준)
      let latestSession;
      try {
        latestSession = await GameSession.findById(sessionId);
      } catch (err) {
        console.error('❌ joinSession DB 조회 실패2:', err.message)
      }
      if (!latestSession) return;

      io.to(sessionId).emit('scoreboard', {
        success: true,
        data: {
          players: session.players.map(p => ({
            username: p.username,
            score: p.score,
            correctAnswersCount: p.correctAnswersCount || 0,
            connected: p.connected
          }))
        }
      });

      const connectedCount = session.players.filter(p => p.connected).length;
      // 스킵투표 인원수 공개
      io.to(sessionId).emit('voteSkipUpdate', {
        success: true,
        data: {
          votes: session.skipVotes.length,
          total: connectedCount
        }
      });

      // 대기 상태 알림
      io.to(sessionId).emit('waiting-room', {
        success: true,
        type: 'waiting-room',
        data: {
          host: session.host?.toString() || '__NONE__',
          players: session.players.map(p => ({
            username: p.username,
            userId: p.userId.toString(),
            connected: p.connected
          })),
          isStarted: session.isStarted || false
        }
      });

      socket.emit('host-updated', {
        success: true,
        data: {
        host: hostUser?.userId?.toString() || '__NONE__'
        }
      });

      });

    socket.emit('session-ready');

    socket.on('disconnect', async () => {
      const { sessionId, username, userId } = socket;
      if (!sessionId || !username) return;

      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);

      // 3초 후에도 같은 사용자가 다시 접속해 있지 않다면 제거
      setTimeout(async () => {
        let socketsInRoom;
        try {
          socketsInRoom = await io.in(sessionId).fetchSockets();
        } catch (err) {
          console.error('❌ joinSession DB 조회 실패2:', err.message)
        }
        
        const stillConnected = socketsInRoom.some(s => s.userId  === userId);

        if (stillConnected) {
          return;
        }

        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session) {
          console.error('❌ 세션 저장 중 에러 발생 - disconnect');
          return;
        }

        // 해당 유저 제거
        const player = session.players.find(p => p.userId.toString() === userId.toString());
        if (player) {
          player.connected = false;
          player.lastSeen = new Date();
          player.socketId = null;
          session.markModified('players');
        }

        // host였으면 새로 지정
        if (session.host?.toString() === userId.toString()) {
          const nextHost = session.players.find(p => p.connected);
          session.host = nextHost ? new ObjectId(nextHost.userId) : null;
        }

        const success2 = await safeSaveSession(session);
        if (!success2) {
          console.error('❌ 세션 저장 중 에러 발생 - disconnect2');
          return;
        }

        const connectedCount = session.players.filter(p => p.connected).length;

        // 분기 처리
        if (session.isStarted) {
          // 게임 중: 점수판 갱신
          io.to(sessionId).emit('scoreboard', {
            success: true,
            data: {
              players: session.players.map(p => ({
                username: p.username,
                score: p.score,
                correctAnswersCount: p.correctAnswersCount || 0,
                connected: p.connected
              }))
            }
          });

          io.to(sessionId).emit('host-updated', {
            success: true,
            data: {
              host: session.host?.toString() || '__NONE__'
            }
          });

          io.to(sessionId).emit('voteSkipUpdate', {
            success: true,
            data: {
              votes: session.skipVotes.length,
              total: connectedCount
            }
          });

        } else {
          // 대기 상태: 대기룸 갱신
          io.to(sessionId).emit('waiting-room', {
            success: true,
            type: 'waiting-room',
            data: {
              host: session.host?.toString() || '__NONE__',
              players: session.players.map(p => ({
                username: p.username,
                userId: p.userId.toString(),
                connected: p.connected
              })),
              isStarted: session.isStarted || false
            }
          });
        }

      }, 3000); // 3초 후에도 접속 안 되어 있으면 제거
    });

    socket.on('startGame', async ({ sessionId }) => {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || session.isStarted) return;
        
      if (session.host?.toString() !== socket.userId) return; // 방장만 시작 가능
        
      session.isStarted = true;
      session.isActive = true;
      session.questionStartAt = new Date();
      session.currentQuestionIndex = 0; // 첫 문제 준비
      const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - startGame');
          return;
        }
        
      const quiz = await safeFindQuizById(Quiz, session.quizId);

      io.to(sessionId).emit('game-started', {
        success: true,
        data: {
          quiz,
          host: session.host?.toString() || '__NONE__',
          questionStartAt: session.questionStartAt
        }
      });

      const connectedCount = session.players.filter(p => p.connected).length;

      io.to(sessionId).emit('voteSkipUpdate', {
        success: true,
        data: {
          votes: session.skipVotes.length,
          total: connectedCount
        }
      });

    });

    // 일반 채팅은 DB에 로그 저장
    socket.on('chatMessage', async ({ sessionId, message }) => {
      if (!message?.trim()) return;

      const username = socket.username;

      try {
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
      } catch (err) {
        console.error('❌ 채팅 로그 저장 실패:', err.message)
      }
      io.to(sessionId).emit('chat', { user: username, message });
    });

    // 클라이언트에서 정답 판별 후 전송하는 이벤트
    socket.on('correct', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await safeFindSessionById(GameSession, sessionId);
    if (!session || !session.isActive) return;

    const username = socket.username;

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
    player.correctAnswersCount = (player.correctAnswersCount || 0) + 1;

    session.correctUsers = session.correctUsers || {};
    if (!session.correctUsers[qIndex]) {
      session.correctUsers[qIndex] = [];
    }
    if (!session.correctUsers[qIndex].includes(username)) {
      session.correctUsers[qIndex].push(username);
    } else {
    }

    session.markModified('correctUsers');

    // player.answered[qIndex] = true;
    session.set(`players.${playerIndex}.answered.${qIndex}`, true);
    session.markModified('players');
    const success = await safeSaveSession(session);
      if (!success) {
        console.error('❌ 세션 저장 중 에러 발생 - chatMessage');
        return;
      }

    try {
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
      } catch (err) {
        console.error('❌ 정답 채팅 로그 저장 실패:', err.message);
      }

    io.to(sessionId).emit('correct', {
      success: true,
      data: {
        username
      }
    });

    io.to(sessionId).emit('scoreboard', {
      success: true,
      data: {
        players: session.players.map(p => ({
          username: p.username,
          score: p.score,
          correctAnswersCount: p.correctAnswersCount || 0,
          connected: p.connected
        }))
      }
    });
  });

  // 스킵투표
  socket.on('voteSkip', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await safeFindSessionById(GameSession, sessionId);
    if (!session || !session.isActive) return;

    const username = socket.username;

    if (!session.skipVotes.includes(username)) {
      session.skipVotes.push(username);
      const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - voteSkip');
          return;
        }

      const connectedCount = session.players.filter(p => p.connected).length; 

      io.to(sessionId).emit('voteSkipUpdate', {
        success: true,
        data: {
          votes: session.skipVotes.length,
          total: connectedCount
        }
      });

      const totalPlayers = session.players.length;
      const voteRatio = session.skipVotes.length / totalPlayers;

      if (voteRatio >= 0.5) {
        await revealAnswer(sessionId, io, app)();
      }
    }
  });

  // //방장 강제스킵
  socket.on('forceSkip', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await safeFindSessionById(GameSession, sessionId);
    if (!session || session.host?.toString() !== socket.userId) return;

    await revealAnswer(sessionId, io, app)();
  });


  socket.on('revealAnswer', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await safeFindSessionById(GameSession, sessionId);
    if (!session) return;

    if (session.revealedAt) return;

    const quiz = await safeFindQuizById(Quiz, session.quizId);
    const index = session.currentQuestionIndex;
    const question = quiz.questions[index];
    if (!quiz || !quiz.questions || !quiz.questions[index]) return;

    session.revealedAt = new Date();
    const success = await safeSaveSession(session);
      if (!success) {
        console.error('❌ 세션 저장 중 에러 발생 - revealAnswer');
        return;
      }

    // 모든 참가자에게 정답 전송
    io.to(sessionId).emit('answerReveal', {
      success: true,
      data: {
        answers: question.answers,
        answerImage: question.answerImageBase64,
        index,
        revealedAt: session.revealedAt
      }
    });
  });

  // 정답공개후 다음 문제로 넘기기
  socket.on('nextQuestion', async ({ sessionId }) => {
    if (!ObjectId.isValid(sessionId)) return;
    const session = await safeFindSessionById(GameSession, sessionId);
    if (!session || session.host?.toString() !== socket.userId) return;

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
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || !session.isActive) return;

      // 중복투표 방지
      if (session.revealedAt) return;

      const quiz = await safeFindQuizById(Quiz, session.quizId);
      const question = quiz.questions[session.currentQuestionIndex];

      const revealedAt = new Date();

      session.revealedAt = revealedAt;
      const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - revealAnswer');
          return;
        }

      io.to(sessionId).emit('answerReveal', {
        success: true,
        data: {
          answers: question.answers,
          answerImage: question.answerImageBase64,
          index: session.currentQuestionIndex,
          revealedAt,
        }
      });
    };
  }

  //문제 타이머 함수
  async function goToNextQuestion(sessionId, io, app) {
  const quizDb = app.get('quizDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);

  if (!ObjectId.isValid(sessionId)) return;
  const session = await safeFindSessionById(GameSession, sessionId);
  if (!session) return;

  const quiz = await safeFindQuizById(Quiz, session.quizId);

  session.revealedAt = null;
  session.currentQuestionIndex += 1;
  session.skipVotes = [];
  session.questionStartAt = new Date();

  // 모든 문제를 완료한 경우
  if (session.currentQuestionIndex >= quiz.questions.length) {
    session.isActive = false;
    session.endedAt = new Date()
    const success = await safeSaveSession(session);
      if (!success) {
        console.error('❌ 세션 저장 중 에러 발생 - goToNextQuestion');
        return;
      }

    // 완료된 게임 수 증가
    await Quiz.findByIdAndUpdate(
      session.quizId,
      { $inc: { completedGameCount: 1 } }
    );

    io.to(sessionId).emit('end', {
      success: true,
      message: '퀴즈 종료!'
    });
    return;
  }

    const success = await safeSaveSession(session);
      if (!success) {
        console.error('❌ 세션 저장 중 에러 발생 - goToNextQuestion2');
        return;
      }

  io.to(sessionId).emit('next', {
    success: true,
    data: {
      index: session.currentQuestionIndex,
      questionStartAt: session.questionStartAt,
      totalPlayers: session.players.length,
    }
  });
};

};