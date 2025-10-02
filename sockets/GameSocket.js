const jwt = require('jsonwebtoken');
const cookieParser = require('socket.io-cookie-parser');
const JWT_SECRET = process.env.JWT_SECRET;

const handleSocketError = (socket, error, eventName) => {
  console.error(`❌ Socket Error in ${eventName}:`, error);
  socket.emit('socket-error', {
    success: false,
    message: `An error occurred in ${eventName}.`,
    error: error.message,
  });
};

module.exports = (io, app) => {
    /**
   * 스코어보드 업데이트 emit 함수
   * @param {Object} io - Socket.IO 인스턴스
   * @param {string} sessionId - 세션 ID
   * @param {Array} players - 플레이어 배열
   */
    function emitScoreboard(io, sessionId, players) {
    io.to(sessionId).emit('scoreboard', {
      success: true,
      data: {
        players: players.map(p => ({
          username: p.username,
          nickname: p.nickname,
          score: p.score,
          correctAnswersCount: p.correctAnswersCount || 0,
          connected: p.connected,
          profileImage: p.profileImage
        }))
      }
    });
  }
  const quizDb = app.get('quizDb');
  const userDb = app.get('userDb');
  const GameSession = require('../models/GameSession')(quizDb);
  const Quiz = require('../models/Quiz')(quizDb);
  const ChatLog = require('../models/ChatLog')(quizDb);
  const sessionUserCache = new Map();
  const { safeFindSessionById, safeSaveSession } = require('../utils/sessionHelpers');
  const { ObjectId } = require('mongoose').Types;

  io.use(cookieParser());

  io.use(async (socket, next) => {
    try {
      const token = socket.request.cookies.accessToken;

      if (!token) {
        console.warn('Socket.IO: No access token found in cookies.');
        return next(new Error('Authentication error: No token provided.'));
      }

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
      try {
        const quizDb = app.get('quizDb');
        const userDb = app.get('userDb');
        const GameSession = require('../models/GameSession')(quizDb);
        const User = require('../models/User')(userDb);
        
        const userId = socket.userId;
        const username = socket.username;
        
        if (!ObjectId.isValid(sessionId)) return;
        
        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session) return;
        const user = await User.findById(userId).select('nickname profileImage');

        if (!sessionUserCache.has(sessionId)) {
            sessionUserCache.set(sessionId, new Map());
        }
        
        sessionUserCache.get(sessionId).set(socket.userId, {
            nickname: user?.nickname,
            profileImage: user?.profileImage
        });

        
        let updated = false;
        let player = session.players.find(p => p.userId.toString() === userId.toString());
        
        if (!player) {
          session.players.push({
            userId,
            username,
            nickname: user?.nickname || null,
            profileImage: user?.profileImage || null,
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
          player.nickname = user?.nickname || null,
          player.profileImage = user?.profileImage || null;
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

        emitScoreboard(io, sessionId, session.players);

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
              nickname: p.nickname,
              userId: p.userId.toString(),
              connected: p.connected,
              profileImage: p.profileImage
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
      } catch (error) {
        handleSocketError(socket, error, 'joinSession');
      }
    });

    socket.emit('session-ready');

    socket.on('disconnect', async () => {
      try {
        const { sessionId, username, userId } = socket;
        if (!sessionId || !username) return;

        const quizDb = app.get('quizDb');
        const GameSession = require('../models/GameSession')(quizDb);

        // 3초 후에도 같은 사용자가 다시 접속해 있지 않다면 제거
        setTimeout(async () => {
          try {
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
              // 세션이 TTL 등으로 이미 삭제된 경우, 해당 클라이언트에게 리다이렉트 명령을 보냄
              socket.emit('forceRedirect', { url: '/' });
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
            emitScoreboard(io, sessionId, session.players);

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
                    nickname: p.nickname,
                    userId: p.userId.toString(),
                    connected: p.connected,
                    profileImage: p.profileImage // 추가!
                  })),
                  isStarted: session.isStarted || false
                }
              });
            }
          } catch (error) {
            handleSocketError(socket, error, 'disconnect:setTimeout');
          }
        }, 3000); // 3초 후에도 접속 안 되어 있으면 제거
      } catch (error) {
        handleSocketError(socket, error, 'disconnect');
      }
    });

    socket.on('startGame', async ({ sessionId }) => {
      try {
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
          
        const quiz = await Quiz.findById(session.quizId);

        await addPlayedQuizzes(quiz._id, socket.userId, app);

        io.to(sessionId).emit('game-started', {
          success: true,
          data: {
            quiz: quiz.toObject(),
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
      } catch (error) {
        handleSocketError(socket, error, 'startGame');
      }
    });

    // 일반 채팅은 DB에 로그 저장
    socket.on('chatMessage', async ({ sessionId, message }) => {
        // 캐시에서 사용자 정보 조회 (DB 조회 없음!)
        const userInfo = sessionUserCache.get(sessionId)?.get(socket.userId) || {
            nickname: null,
            profileImage: null
        };
        
        // 즉시 브로드캐스트
        io.to(sessionId).emit('chat', {
            nickname: userInfo.nickname || userInfo.username,
            profileImage: userInfo.profileImage,
            message
        });
    });

    // 클라이언트에서 정답 판별 후 전송하는 이벤트
    socket.on('correct', async ({ sessionId }) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        const username = socket.username;

        const playerIndex = session.players.findIndex(p => p.username === username);
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];

        if (!player) return;

        const qIndex = String(session.currentQuestionIndex);
        if (player.answered?.[qIndex]) return;

        const displayName = player.nickname || username;

        if (!app.firstCorrectUsers) {
          app.firstCorrectUsers = {};
        }

        const isFirst = !app.firstCorrectUsers[sessionId];
        if (isFirst) {
          app.firstCorrectUsers[sessionId] = displayName;
          player.score += 2;
        } else {
          player.score += 1;
        }
        player.correctAnswersCount = (player.correctAnswersCount || 0) + 1;

        session.correctUsers = session.correctUsers || {};
        if (!session.correctUsers[qIndex]) {
          session.correctUsers[qIndex] = [];
        }
        if (!session.correctUsers[qIndex].includes(displayName)) {
          session.correctUsers[qIndex].push(displayName);
        }

        session.markModified('correctUsers');
        session.set(`players.${playerIndex}.answered.${qIndex}`, true);
        session.markModified('players');
        
        const success = await safeSaveSession(session);
        if (!success) {
          console.error('⌧ 세션 저장 중 에러 발생 - correct');
          return;
        }

        const userInfo = sessionUserCache.get(sessionId)?.get(socket.userId) || {
            nickname: null,
            profileImage: null
        };

        try {
            await ChatLog.findOneAndUpdate(
              { sessionId },
              {
                $push: {
                  messages: {
                    username,
                    message: `${displayName}님이 정답을 맞혔습니다! 🎉`,
                    createdAt: new Date()
                  }
                }
              },
              { upsert: true, new: true }
            );
        } catch (err) {
          console.error('⌧ 정답 채팅 로그 저장 실패:', err.message);
        }

        io.to(sessionId).emit('correct', {
          success: true,
          data: {
            nickname: displayName,
            profileImage: userInfo.profileImage
          }
        });

        emitScoreboard(io, sessionId, session.players);
      } catch (error) {
        handleSocketError(socket, error, 'correct');
      }
    });

    //객관식 문제 정답처리
    socket.on('choiceQuestionCorrect', async ({ sessionId }) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        const username = socket.username;

        const playerIndex = session.players.findIndex(p => p.username === username);
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];

        if (!player) return;

        const qIndex = String(session.currentQuestionIndex);
        if (player.answered?.[qIndex]) return;

        const displayName = player.nickname || username;

        session.choiceQuestionCorrectUsers = session.choiceQuestionCorrectUsers || {};
        if (!session.choiceQuestionCorrectUsers[qIndex]) {
          session.choiceQuestionCorrectUsers[qIndex] = [];
        }
        if (!session.choiceQuestionCorrectUsers[qIndex].includes(displayName)) {
          session.choiceQuestionCorrectUsers[qIndex].push(displayName);
        }

        session.set(`players.${playerIndex}.answered.${qIndex}`, true);
        session.markModified('choiceQuestionCorrectUsers');
        session.markModified('players');
        
        const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - chatMessage');
          return;
        }

        await handleChoiceQuestionCompletion(sessionId, io, app, 'all_answered');

      } catch (error) {
        handleSocketError(socket, error, 'correct');
      }
    });

    socket.on('choiceQuestionIncorrect', async ({sessionId}) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        const username = socket.username;

        const playerIndex = session.players.findIndex(p => p.username === username);
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];

        if (!player) return;

        const qIndex = String(session.currentQuestionIndex);
        if (player.answered?.[qIndex]) return;

        session.set(`players.${playerIndex}.answered.${qIndex}`, true);
        session.markModified('players');

        const success = await safeSaveSession(session);
        if (!success) {
          console.error('세션 저장 중 에러 발생 - choiceQuestionIncorrect');
          return;
        }

        await handleChoiceQuestionCompletion(sessionId, io, app, 'all_answered');

      } catch (error) {
        handleSocketError(socket, error, 'choiceQuestionIncorrect');
      }
    });

  // 스킵투표
  socket.on('voteSkip', async ({ sessionId }) => {
    try {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || !session.isActive) return;

      const username = socket.username;
      const player = session.players.find(p => p.username === username);
      const displayName = player?.nickname || username;

      if (!session.skipVotes.includes(displayName)) {
        session.skipVotes.push(displayName);
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
          const qIndex = String(session.currentQuestionIndex);
          const hasChoiceQuestionData = session.choiceQuestionCorrectUsers && 
                                        session.choiceQuestionCorrectUsers[qIndex] && 
                                        session.choiceQuestionCorrectUsers[qIndex].length > 0;

          if (hasChoiceQuestionData) {
            await handleChoiceQuestionCompletion(sessionId, io, app, 'vote_skip');
          } else {
            await revealAnswer(sessionId, io, app)();
          }
        }
      }
    } catch (error) {
      handleSocketError(socket, error, 'voteSkip');
    }
  });

  // //방장 강제스킵
  socket.on('forceSkip', async ({ sessionId }) => {
    try {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || session.host?.toString() !== socket.userId) return;

      const qIndex = String(session.currentQuestionIndex);
      const hasChoiceQuestionData = session.choiceQuestionCorrectUsers && 
                                    session.choiceQuestionCorrectUsers[qIndex] && 
                                    session.choiceQuestionCorrectUsers[qIndex].length > 0;

      if (hasChoiceQuestionData) {
        // 객관식: 통합 함수 사용
        await handleChoiceQuestionCompletion(sessionId, io, app, 'force_skip');
      } else {
        // 주관식: 기존 로직
        await revealAnswer(sessionId, io, app)();
      }
    } catch (error) {
      handleSocketError(socket, error, 'forceSkip');
    }
  });


  socket.on('revealAnswer', async ({ sessionId }) => {
    try {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session) return;

      if (session.revealedAt) return;

      const quiz = await Quiz.findById(session.quizId);
      const index = session.currentQuestionIndex;
      const question = quiz.questions[index];
      const qIndex = String(index);
      
      if (!quiz || !quiz.questions || !quiz.questions[index]) return;

      session.revealedAt = new Date();

      // choiceQuestionCorrectUsers → correctUsers로 데이터 이동
      if (session.choiceQuestionCorrectUsers && session.choiceQuestionCorrectUsers[qIndex]) {
        session.correctUsers = session.correctUsers || {};
        session.correctUsers[qIndex] = [...session.choiceQuestionCorrectUsers[qIndex]];
        
        // 임시 데이터 정리
        delete session.choiceQuestionCorrectUsers[qIndex];
        
        session.markModified('correctUsers');
        session.markModified('choiceQuestionCorrectUsers');
      }

      const success = await safeSaveSession(session);
        if (!success) {
          console.error('❌ 세션 저장 중 에러 발생 - revealAnswer');
          return;
        }

      // 현재 문제의 정답자 목록 가져오기
      const correctUsers = session.correctUsers?.[qIndex] || [];

      // 모든 참가자에게 정답 전송
      io.to(sessionId).emit('revealAnswer_Emit', {
        success: true,
        data: {
          answers: question.answers,
          answerImage: question.answerImageBase64,
          index,
          revealedAt: session.revealedAt,
          correctUsers: correctUsers
        }
      });

      // 2. 스코어보드 업데이트
      emitScoreboard(io, sessionId, session.players);

    } catch (error) {
      handleSocketError(socket, error, 'revealAnswer');
    }
  });

  // 정답공개후 다음 문제로 넘기기
  socket.on('nextQuestion', async ({ sessionId }) => {
    try {
      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || session.host?.toString() !== socket.userId) return;

      if (app.firstCorrectUsers) {
        delete app.firstCorrectUsers[sessionId];
      }

      await goToNextQuestion(sessionId, io, app);
    } catch (error) {
      handleSocketError(socket, error, 'nextQuestion');
    }
  });
  
  });

  async function addPlayedQuizzes(quizId, userId, app) {
    try {
      if (!quizId || !userId) return;

      const User = require('../models/User')(userDb);

      // 1. ID를 사용해 사용자 문서를 데이터베이스에서 가져옵니다.
      const user = await User.findById(userId);

      if (!user) {
        return;
      }

      if (user.playedQuizzes && user.playedQuizzes.includes(quizId)) {
        return;
      }

      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { playedQuizzes: quizId } }
      );

    } catch (error) {
      // 데이터베이스의 playedQuizzes 필드가 문자열이면 여전히 이 오류가 발생할 수 있습니다.
      console.error('퀴즈 플레이 기록 실패', error);
      throw error; // startGame 핸들러가 오류를 인지하도록 다시 던집니다.
    }
  }

  // 문제 종료 후 정답 공개
  function revealAnswer(sessionId, io, app) {
    return async () => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        // 중복투표 방지
        if (session.revealedAt) return;

        const quiz = await Quiz.findById(session.quizId);
        const question = quiz.questions[session.currentQuestionIndex];
        const qIndex = String(session.currentQuestionIndex);

        const revealedAt = new Date();

        session.revealedAt = revealedAt;

        // choiceQuestionCorrectUsers → correctUsers로 데이터 이동
        if (session.choiceQuestionCorrectUsers && session.choiceQuestionCorrectUsers[qIndex]) {
          session.correctUsers = session.correctUsers || {};
          session.correctUsers[qIndex] = [...session.choiceQuestionCorrectUsers[qIndex]];
          
          // 임시 데이터 정리
          delete session.choiceQuestionCorrectUsers[qIndex];
          
          session.markModified('correctUsers');
          session.markModified('choiceQuestionCorrectUsers');
        }
        
        const success = await safeSaveSession(session);
          if (!success) {
            console.error('❌ 세션 저장 중 에러 발생 - revealAnswer');
            return;
          }

        // 현재 문제의 정답자 목록 가져오기
        const correctUsers = session.correctUsers?.[qIndex] || [];

        io.to(sessionId).emit('revealAnswer_Emit', {
          success: true,
          data: {
            answers: question.answers,
            answerImage: question.answerImageBase64,
            index: session.currentQuestionIndex,
            revealedAt,
            correctUsers: correctUsers
          }
        });

        emitScoreboard(io, sessionId, session.players);

      } catch (error) {
        console.error('❌ Error in revealAnswer:', error);
      }
    };
  }

  //문제 타이머 함수
  async function goToNextQuestion(sessionId, io, app) {
    try {
      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);
      const Quiz = require('../models/Quiz')(quizDb);

      if (!ObjectId.isValid(sessionId)) return;
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session) return;

      const quiz = await Quiz.findById(session.quizId);

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
    } catch (error) {
      console.error('❌ Error in goToNextQuestion:', error);
    }
  };

  async function handleChoiceQuestionCompletion(sessionId, io, app, triggerType = 'all_answered') {
    try {
      const GameSession = require('../models/GameSession')(app.get('quizDb'));
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || !session.isActive) return;

      const qIndex = String(session.currentQuestionIndex);
      const connectedPlayers = session.players.filter(p => p.connected);
      
      // 완료 조건 확인
      let shouldComplete = false;
      
      switch (triggerType) {
        case 'all_answered':
          // 모든 플레이어가 답변 완료
          shouldComplete = connectedPlayers.every(player => 
            player.answered && player.answered[qIndex] === true
          );
          break;
          
        case 'vote_skip':
          // 스킵 투표 통과 (이미 외부에서 확인됨)
          shouldComplete = true;
          break;
          
        case 'force_skip':
          // 강제 스킵 (이미 외부에서 확인됨)
          shouldComplete = true;
          break;
          
        default:
          shouldComplete = false;
      }

      if (shouldComplete) {
        const correctDisplayNames = session.choiceQuestionCorrectUsers[qIndex] || [];
        
        if (correctDisplayNames.length > 0) {
          correctDisplayNames.forEach((displayName, index) => {
            const player = session.players.find(p => 
              (p.nickname || p.username) === displayName
            );
            if (player) {
              if (index === 0) {
                // 첫 번째 정답자: 2점
                player.score += 2;
              } else {
                // 나머지 정답자: 1점
                player.score += 1;
              }
              player.correctAnswersCount = (player.correctAnswersCount || 0) + 1;
            }
          });

          session.markModified('players');
        }

        // 정답 공개 상태로 변경
        const revealedAt = new Date();
        session.revealedAt = revealedAt;

        // 첫 정답자 초기화
        if (app.firstCorrectUsers) {
          delete app.firstCorrectUsers[sessionId];
        }

        const success = await safeSaveSession(session);
        if (!success) {
          console.error('객관식 완료 처리 중 세션 저장 실패');
          return;
        }

        // 퀴즈 정보 가져오기
        const Quiz = require('../models/Quiz')(app.get('quizDb'));
        const quiz = await Quiz.findById(session.quizId);
        const question = quiz.questions[session.currentQuestionIndex];

        io.to(sessionId).emit('revealAnswer_Emit', {
          success: true,
          data: {
            answers: question.answers,
            answerImage: question.answerImageBase64,
            index: session.currentQuestionIndex,
            revealedAt,
            correctUsers: correctDisplayNames
          }
        });

        // 스코어보드 업데이트 이벤트 발생
        emitScoreboard(io, sessionId, session.players);
      }
    } catch (error) {
      console.error('handleChoiceQuestionCompletion 에러:', error);
    }
  }

};