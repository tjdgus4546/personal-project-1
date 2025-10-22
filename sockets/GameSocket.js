const jwt = require('jsonwebtoken');
const cookieParser = require('socket.io-cookie-parser');
const crypto = require('crypto'); // 정답 해시화용
const JWT_SECRET = process.env.JWT_SECRET;

const handleSocketError = (socket, error, eventName) => {
  console.error(`❌ Socket Error in ${eventName}:`, error);
  socket.emit('socket-error', {
    success: false,
    message: `An error occurred in ${eventName}.`,
    error: error.message,
  });
};

// 🛡️ 정답 해시화 함수 (SHA-256)
function hashAnswer(answer) {
  // 정답을 정규화: 공백 제거 + 소문자 변환
  const normalized = answer.replace(/\s+/g, '').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

module.exports = (io, app) => {
    /**
   * 스코어보드 업데이트 emit 함수
   * @param {Object} io - Socket.IO 인스턴스
   * @param {string} sessionId - 세션 ID
   * @param {Array} players - 플레이어 배열
   */
    function emitScoreboard(io, sessionId, players) {
    // 순위 정렬: 1차 점수 내림차순, 2차 맞춘 문제 수 내림차순, 3차 정답 시간 오름차순
    const sortedPlayers = [...players].sort((a, b) => {
      // 1차 정렬: 점수 내림차순
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // 2차 정렬: 점수가 같으면 맞춘 문제 수 내림차순
      const countDiff = (b.correctAnswersCount || 0) - (a.correctAnswersCount || 0);
      if (countDiff !== 0) {
        return countDiff;
      }
      // 3차 정렬: 맞춘 문제 수도 같으면 정답을 빨리 맞춘 사람이 높은 순위
      // lastCorrectTime이 없는 경우(정답을 하나도 못 맞춘 경우) 가장 낮은 순위로
      if (!a.lastCorrectTime && !b.lastCorrectTime) return 0;
      if (!a.lastCorrectTime) return 1; // a가 정답 없음 -> b가 더 높은 순위
      if (!b.lastCorrectTime) return -1; // b가 정답 없음 -> a가 더 높은 순위
      return a.lastCorrectTime - b.lastCorrectTime; // 빠른 시간(작은 값)이 더 높은 순위
    });

    io.to(sessionId).emit('scoreboard', {
      success: true,
      data: {
        players: sortedPlayers.map(p => ({
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
  const QuizRecord = require('../models/QuizRecord')(quizDb);
  const User = require('../models/User')(userDb);
  const sessionUserCache = new Map();
  const disconnectTimers = new Map(); // 사용자별 disconnect 타이머 저장
  const { safeFindSessionById, safeSaveSession } = require('../utils/sessionHelpers');
  const { ObjectId } = require('mongoose').Types;

  // 🛡️ 30분마다 오래된 세션 캐시 정리 (메모리 누수 방지)
  setInterval(() => {
    const now = Date.now();
    const THIRTY_MINUTES = 30 * 60 * 1000;

    for (const [sessionId] of sessionUserCache.entries()) {
      // 세션이 DB에 없거나 3시간 TTL로 만료되었다면 캐시에서 삭제
      GameSession.findById(sessionId).then(session => {
        if (!session) {
          sessionUserCache.delete(sessionId);
          console.log(`🧹 만료된 세션 캐시 정리: ${sessionId}`);
        }
      }).catch(err => {
        // DB 조회 실패 시 무시
      });
    }

    // firstCorrectUsers도 같은 방식으로 정리
    if (app.firstCorrectUsers) {
      for (const sessionId in app.firstCorrectUsers) {
        GameSession.findById(sessionId).then(session => {
          if (!session) {
            delete app.firstCorrectUsers[sessionId];
            console.log(`🧹 만료된 firstCorrectUsers 정리: ${sessionId}`);
          }
        }).catch(err => {
          // DB 조회 실패 시 무시
        });
      }
    }
  }, 30 * 60 * 1000); // 30분마다 실행

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

        if (!ObjectId.isValid(sessionId)) return;

        const session = await safeFindSessionById(GameSession, sessionId);
        if (!session) return;

        // 최대 인원 체크 (12명)
        const MAX_PLAYERS = 12;
        const existingPlayer = session.players.find(p => p.userId.toString() === userId.toString());
        const connectedPlayers = session.players.filter(p => p.connected);

        // 기존 플레이어가 아니고, 이미 12명이 접속 중이면 거부
        if (!existingPlayer && connectedPlayers.length >= MAX_PLAYERS) {
          socket.emit('join-error', {
            success: false,
            message: '게임 세션에 정원이 다 찼습니다!'
          });
          return;
        }

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

        // 🔄 재접속 시 게임 진행 중이면 퀴즈 데이터 재전송
        if (session.isActive && session.cachedQuizData) {
          socket.emit('game-started', {
            success: true,
            data: {
              quiz: session.cachedQuizData, // 캐시된 해시화된 퀴즈
              host: session.host?.toString() || '__NONE__',
              questionOrder: session.questionOrder,
              currentQuestionIndex: session.questionOrder[session.currentQuestionIndex]
            }
          });

          // 현재 진행 중인 문제 정보도 전송
          socket.emit('question-started', {
            success: true,
            data: {
              questionIndex: session.currentQuestionIndex,
              actualQuestionIndex: session.questionOrder[session.currentQuestionIndex],
              readyPlayers: session.readyPlayers || []
            }
          });
        }
      } catch (error) {
        handleSocketError(socket, error, 'joinSession');
      }
    });

    socket.emit('session-ready');

    socket.on('disconnect', async () => {
      try {
        const { sessionId, userId } = socket;
        if (!sessionId || !userId) return;

        const quizDb = app.get('quizDb');
        const GameSession = require('../models/GameSession')(quizDb);

        // 기존 타이머가 있으면 취소 (빠른 재접속 시 중복 방지)
        if (disconnectTimers.has(userId)) {
          clearTimeout(disconnectTimers.get(userId));
          disconnectTimers.delete(userId);
        }

        // 3초 후에도 같은 사용자가 다시 접속해 있지 않다면 제거
        const timer = setTimeout(async () => {
          try {
            let socketsInRoom;
            try {
              socketsInRoom = await io.in(sessionId).fetchSockets();
            } catch (err) {
              console.error('❌ disconnect - fetchSockets 실패:', err.message)
            }

            const stillConnected = socketsInRoom.some(s => s.userId === userId);

            if (stillConnected) {
              return;
            }

            let session = await safeFindSessionById(GameSession, sessionId);
            if (!session) {
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
              session.markModified('host');
            }

            const success2 = await safeSaveSession(session);
            if (!success2) {
              console.error('❌ 세션 저장 중 에러 발생 - disconnect2');
              return;
            }

            // 최신 세션 다시 조회 (DB에 저장된 상태)
            session = await safeFindSessionById(GameSession, sessionId);
            if (!session) return;

            const connectedCount = session.players.filter(p => p.connected).length;

            // 🛡️ 모든 플레이어가 나간 경우 즉시 메모리 정리
            if (connectedCount === 0) {
              if (sessionUserCache.has(sessionId)) {
                sessionUserCache.delete(sessionId);
              }
              if (app.firstCorrectUsers && app.firstCorrectUsers[sessionId]) {
                delete app.firstCorrectUsers[sessionId];
              }
              return;
            }

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

              // 나간 유저의 ready 상태 제거 및 재확인
              const currentQuestionIndex = session.currentQuestionIndex;
              const removedKeys = session.readyPlayers.filter(
                key => key.includes(`_${userId}`)
              );

              if (removedKeys.length > 0) {
                // 원자적 업데이트로 해당 유저의 ready 상태 제거
                const updatedSession = await GameSession.findByIdAndUpdate(
                  sessionId,
                  { $pull: { readyPlayers: { $in: removedKeys } } },
                  { new: true }
                );

                if (updatedSession) {
                  // 남은 플레이어로 ready 체크
                  const readyForThisQuestion = updatedSession.readyPlayers.filter(
                    key => key.startsWith(`${currentQuestionIndex}_`)
                  );
                  const remainingConnected = updatedSession.players.filter(p => p.connected);

                  if (readyForThisQuestion.length >= remainingConnected.length && remainingConnected.length > 0) {
                    // 모든 남은 플레이어가 준비 완료
                    const startResult = await GameSession.findByIdAndUpdate(
                      sessionId,
                      { $set: { questionStartAt: new Date() } },
                      { new: true }
                    );

                    if (startResult) {
                      io.to(sessionId).emit('question-start', {
                        success: true,
                        data: {
                          questionStartAt: startResult.questionStartAt
                        }
                      });
                    }
                  }
                }
              }

            } else {
              // 대기 상태: 대기룸 갱신
              io.to(sessionId).emit('waiting-room', {
                success: true,
                type: 'waiting-room',
                data: {
                  host: session.host?.toString() || '__NONE__',
                  players: session.players.map(p => ({
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
          } finally {
            // 타이머 정리
            disconnectTimers.delete(userId);
          }
        }, 3000); // 3초 후에도 접속 안 되어 있으면 제거

        // 타이머를 Map에 저장
        disconnectTimers.set(userId, timer);

        // 모든 소켓 이벤트 리스너 제거 (메모리 누수 방지)
        socket.removeAllListeners('joinSession');
        socket.removeAllListeners('startGame');
        socket.removeAllListeners('client-ready');
        socket.removeAllListeners('chatMessage');
        socket.removeAllListeners('correct');
        socket.removeAllListeners('choiceQuestionCorrect');
        socket.removeAllListeners('choiceQuestionIncorrect');
        socket.removeAllListeners('voteSkip');
        socket.removeAllListeners('forceSkip');
        socket.removeAllListeners('revealAnswer');
        socket.removeAllListeners('nextQuestion');
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

        const quiz = await Quiz.findById(session.quizId);
        if (!quiz) return;

        // ✅ 문제 순서 생성 로직
        const questionCount = quiz.questions.length;
        let questionOrder = Array.from(Array(questionCount).keys()); // [0, 1, 2, ...]

        if (quiz.isRandomOrder) {
          // Fisher-Yates (aka Knuth) Shuffle
          let currentIndex = questionOrder.length, randomIndex;
          while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [questionOrder[currentIndex], questionOrder[randomIndex]] = [
              questionOrder[randomIndex], questionOrder[currentIndex]];
          }
        }

        session.isStarted = true;
        session.isActive = true;
        session.questionOrder = questionOrder; // 세션에 문제 순서 저장
        session.currentQuestionIndex = 0; // currentQuestionIndex는 questionOrder 배열의 위치(0부터 시작)
        session.readyPlayers = []; // 준비 상태 초기화

        // 🛡️ 정답 해시화: 캐시 + 클라이언트 전송용
        const quizData = quiz.toObject();
        const hashedQuiz = {
          ...quizData,
          questions: quizData.questions.map(q => {
            // 객관식 문제인 경우
            if (q.incorrectAnswers && q.incorrectAnswers.length > 0) {
              // 선택지 생성: 정답 + 오답 섞기 (원본 텍스트)
              const allChoices = [...q.answers, ...q.incorrectAnswers];

              // Fisher-Yates 셔플 (클라이언트에서 같은 순서 보장)
              for (let i = allChoices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allChoices[i], allChoices[j]] = [allChoices[j], allChoices[i]];
              }

              return {
                ...q,
                choices: allChoices, // 원본 선택지 (화면 표시용)
                answers: q.answers.map(a => hashAnswer(a)), // 해시화된 정답 (검증용)
                incorrectAnswers: undefined // 불필요한 데이터 제거
              };
            }

            // 주관식 문제인 경우
            return {
              ...q,
              answers: q.answers ? q.answers.map(a => hashAnswer(a)) : [] // 해시화된 정답만
            };
          })
        };

        // 🚀 Quiz 데이터 캐싱 (해시된 데이터 저장 - 정답 검증용)
        session.cachedQuizData = hashedQuiz;
        session.markModified('cachedQuizData');

        const success = await safeSaveSession(session);
        if (!success) {
            console.error('❌ 세션 저장 중 에러 발생 - startGame');
            return;
        }

        await addPlayedQuizzes(quiz._id, socket.userId, app);

        // 문제 데이터만 전송 (타이머는 아직 시작하지 않음)
        io.to(sessionId).emit('game-started', {
          success: true,
          data: {
            quiz: hashedQuiz, // 해시화된 퀴즈 전송
            host: session.host?.toString() || '__NONE__',
            questionOrder: session.questionOrder,
            currentQuestionIndex: session.questionOrder[0]
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

    // 클라이언트 준비 완료 이벤트
    socket.on('client-ready', async ({ sessionId }) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;

        const userId = socket.userId;

        // 먼저 현재 세션 상태 확인
        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        const currentQuestionIndex = session.currentQuestionIndex;
        const readyKey = `${currentQuestionIndex}_${userId}`;

        // 원자적 업데이트: $addToSet으로 중복 없이 추가
        const updateResult = await GameSession.findByIdAndUpdate(
          sessionId,
          { $addToSet: { readyPlayers: readyKey } },
          { new: true } // 업데이트된 문서 반환
        );

        if (!updateResult) {
          console.error('❌ 세션 업데이트 실패 - client-ready');
          return;
        }

        session = updateResult;

        // 현재 문제 인덱스에 대한 준비 완료 카운트
        const readyForThisQuestion = session.readyPlayers.filter(
          key => key.startsWith(`${currentQuestionIndex}_`)
        );

        const connectedPlayers = session.players.filter(p => p.connected);
        const readyCount = readyForThisQuestion.length;
        const totalCount = connectedPlayers.length;

        // 모든 플레이어가 준비 완료했는지 확인
        const allReady = readyCount >= totalCount;

        if (allReady) {
          // 문제 시작 시간 설정 (원자적 업데이트)
          const startResult = await GameSession.findByIdAndUpdate(
            sessionId,
            { $set: { questionStartAt: new Date() } },
            { new: true }
          );

          if (!startResult) {
            console.error('❌ 세션 저장 중 에러 발생 - client-ready-all');
            return;
          }

          // 모든 클라이언트에게 시작 신호 전송
          io.to(sessionId).emit('question-start', {
            success: true,
            data: {
              questionStartAt: startResult.questionStartAt
            }
          });
        }
      } catch (error) {
        handleSocketError(socket, error, 'client-ready');
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
            nickname: userInfo.nickname || 'Unknown',
            profileImage: userInfo.profileImage,
            message
        });
    });

    // 클라이언트에서 정답을 전송하면 서버에서 검증하는 이벤트
    socket.on('correct', async ({ sessionId, questionIndex, currentIndex, timestamp, answer }) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        // 🛡️ 타임스탬프 검증 (서버 부담 거의 없음)
        if (timestamp) {
          // 1. 문제 시작 후 너무 빨리 답하면 차단 (0.1초 이내)
          const timeSinceStart = Date.now() - session.questionStartAt?.getTime();
          if (timeSinceStart < 100) {
            console.warn(`⚠️ 의심스러운 정답 시도: 너무 빠름 (${timeSinceStart}ms)`);
            return;
          }

          // 2. 클라이언트 타임스탬프와 서버 시간 차이 확인 (5초 이상 차이나면 차단)
          const timeDiff = Math.abs(Date.now() - timestamp);
          if (timeDiff > 5000) {
            console.warn(`⚠️ 의심스러운 정답 시도: 타임스탬프 불일치 (${timeDiff}ms)`);
            return;
          }
        }

        const userId = socket.userId;
        const playerIndex = session.players.findIndex(p => p.userId.toString() === userId.toString());
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];
        if (!player) return;

        // 클라이언트에서 받은 문제 인덱스 사용 (네트워크 지연 대응)
        const actualQuestionIndex = questionIndex !== undefined ? questionIndex : session.questionOrder[session.currentQuestionIndex];
        const qIndex = String(actualQuestionIndex);

        // 중복 정답 방지 (DB에서 확인)
        if (player.answered?.[qIndex]) {
          return;
        }

        // 🛡️ 서버에서 정답 검증
        if (!answer) {
          console.warn(`⚠️ 정답 값이 없음: ${userId}`);
          return;
        }

        // 🚀 캐시된 Quiz 데이터 사용 (DB 조회 없음!)
        const quizData = session.cachedQuizData;
        if (!quizData || !quizData.questions || !quizData.questions[actualQuestionIndex]) {
          console.error(`❌ 캐시된 퀴즈 데이터 없음: 문제 ${actualQuestionIndex}`);
          return;
        }

        const question = quizData.questions[actualQuestionIndex];
        const userAnswerHash = hashAnswer(answer);
        const correctAnswerHashes = question.answers; // 이미 해시된 값이므로 그대로 사용
        const isCorrect = correctAnswerHashes.includes(userAnswerHash);

        // 정답이 아니면 처리 중단
        if (!isCorrect) {
          console.log(`❌ 오답: ${player.nickname || 'Unknown'} - "${answer}"`);
          return;
        }

        const displayName = player.nickname || 'Unknown';

        if (!app.firstCorrectUsers) {
          app.firstCorrectUsers = {};
        }

        const isFirst = !app.firstCorrectUsers[sessionId];
        const scoreIncrement = isFirst ? 2 : 1;

        if (isFirst) {
          app.firstCorrectUsers[sessionId] = displayName;
        }

        // 원자적 업데이트로 버전 충돌 방지 + 중복 방지 조건 추가
        const updateResult = await GameSession.findOneAndUpdate(
          {
            _id: sessionId,
            [`players.${playerIndex}.answered.${qIndex}`]: { $ne: true } // 이미 답변하지 않은 경우만 업데이트
          },
          {
            $set: {
              [`players.${playerIndex}.answered.${qIndex}`]: true,
              [`players.${playerIndex}.lastCorrectTime`]: new Date()
            },
            $inc: {
              [`players.${playerIndex}.score`]: scoreIncrement,
              [`players.${playerIndex}.correctAnswersCount`]: 1
            },
            $addToSet: {
              [`correctUsers.${qIndex}`]: displayName
            }
          },
          { new: true }
        );

        // 업데이트 실패 = 이미 답변했거나 세션이 없음
        if (!updateResult) {
          console.log(`⚠️ 중복 정답 시도 방지: ${displayName} (문제 ${qIndex})`);
          return;
        }

        session = updateResult;

        const userInfo = sessionUserCache.get(sessionId)?.get(socket.userId) || {
            nickname: null,
            profileImage: null
        };

        io.to(sessionId).emit('correct', {
          success: true,
          data: {
            nickname: displayName,
            profileImage: userInfo.profileImage
          }
        });

        emitScoreboard(io, sessionId, session.players);
        await handleSubjectiveQuestionCompletion(sessionId, io, app);
      } catch (error) {
        handleSocketError(socket, error, 'correct');
      }
    });

    //객관식 문제 정답처리
    socket.on('choiceQuestionCorrect', async ({ sessionId, questionIndex, currentIndex, timestamp, answer }) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        // 🛡️ 타임스탬프 검증 (서버 부담 거의 없음)
        if (timestamp) {
          // 1. 문제 시작 후 너무 빨리 답하면 차단 (0.1초 이내)
          const timeSinceStart = Date.now() - session.questionStartAt?.getTime();
          if (timeSinceStart < 100) {
            console.warn(`⚠️ 의심스러운 정답 시도: 너무 빠름 (${timeSinceStart}ms)`);
            return;
          }

          // 2. 클라이언트 타임스탬프와 서버 시간 차이 확인 (5초 이상 차이나면 차단)
          const timeDiff = Math.abs(Date.now() - timestamp);
          if (timeDiff > 5000) {
            console.warn(`⚠️ 의심스러운 정답 시도: 타임스탬프 불일치 (${timeDiff}ms)`);
            return;
          }
        }

        const userId = socket.userId;
        const playerIndex = session.players.findIndex(p => p.userId.toString() === userId.toString());
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];
        if (!player) return;

        // 클라이언트에서 받은 문제 인덱스 사용 (네트워크 지연 대응)
        const actualQuestionIndex = questionIndex !== undefined ? questionIndex : session.questionOrder[session.currentQuestionIndex];
        const qIndex = String(actualQuestionIndex);

        if (player.answered?.[qIndex]) return;

        // 🛡️ 서버에서 정답 검증
        if (!answer) {
          console.warn(`⚠️ 정답 값이 없음: ${userId}`);
          return;
        }

        // 🚀 캐시된 Quiz 데이터 사용 (DB 조회 없음!)
        const quizData = session.cachedQuizData;
        if (!quizData || !quizData.questions || !quizData.questions[actualQuestionIndex]) {
          console.error(`❌ 캐시된 퀴즈 데이터 없음: 문제 ${actualQuestionIndex}`);
          return;
        }

        const question = quizData.questions[actualQuestionIndex];
        const userAnswerHash = hashAnswer(answer);
        const correctAnswerHashes = question.answers; // 이미 해시된 값이므로 그대로 사용
        const isCorrect = correctAnswerHashes.includes(userAnswerHash);

        // 정답이 아니면 처리 중단
        if (!isCorrect) {
          console.log(`❌ 객관식 오답: ${player.nickname || 'Unknown'} - "${answer}"`);
          return;
        }

        const displayName = player.nickname || 'Unknown';

        // 원자적 업데이트로 중복 방지
        const updateResult = await GameSession.findOneAndUpdate(
          {
            _id: sessionId,
            [`players.${playerIndex}.answered.${qIndex}`]: { $ne: true }
          },
          {
            $set: {
              [`players.${playerIndex}.answered.${qIndex}`]: true
            },
            $addToSet: {
              [`choiceQuestionCorrectUsers.${qIndex}`]: displayName
            }
          },
          { new: true }
        );

        if (!updateResult) {
          console.log(`⚠️ 중복 답변 방지: ${displayName} (객관식 문제 ${qIndex})`);
          return;
        }

        session = updateResult;

        await handleChoiceQuestionCompletion(sessionId, io, app, 'all_answered');

      } catch (error) {
        handleSocketError(socket, error, 'correct');
      }
    });

    socket.on('choiceQuestionIncorrect', async ({sessionId, questionIndex, currentIndex, timestamp, answer}) => {
      try {
        if (!ObjectId.isValid(sessionId)) return;
        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        // 🛡️ 타임스탬프 검증 (서버 부담 거의 없음)
        if (timestamp) {
          // 1. 문제 시작 후 너무 빨리 답하면 차단 (0.1초 이내)
          const timeSinceStart = Date.now() - session.questionStartAt?.getTime();
          if (timeSinceStart < 100) {
            console.warn(`⚠️ 의심스러운 답변 시도: 너무 빠름 (${timeSinceStart}ms)`);
            return;
          }

          // 2. 클라이언트 타임스탬프와 서버 시간 차이 확인 (5초 이상 차이나면 차단)
          const timeDiff = Math.abs(Date.now() - timestamp);
          if (timeDiff > 5000) {
            console.warn(`⚠️ 의심스러운 답변 시도: 타임스탬프 불일치 (${timeDiff}ms)`);
            return;
          }
        }

        const userId = socket.userId;
        const playerIndex = session.players.findIndex(p => p.userId.toString() === userId.toString());
        if (playerIndex === -1) return;

        const player = session.players[playerIndex];
        if (!player) return;

        // 클라이언트에서 받은 문제 인덱스 사용 (네트워크 지연 대응)
        const actualQuestionIndex = questionIndex !== undefined ? questionIndex : session.questionOrder[session.currentQuestionIndex];
        const qIndex = String(actualQuestionIndex);

        if (player.answered?.[qIndex]) return;

        // 🛡️ 서버에서 정답 검증 (클라이언트가 정답을 오답으로 속이는 것 방지)
        if (answer) {
          const quizData = session.cachedQuizData;
          if (quizData && quizData.questions && quizData.questions[actualQuestionIndex]) {
            const question = quizData.questions[actualQuestionIndex];
            const userAnswerHash = hashAnswer(answer);
            const correctAnswerHashes = question.answers; // 이미 해시된 값이므로 그대로 사용
            const isActuallyCorrect = correctAnswerHashes.includes(userAnswerHash);

            // 만약 실제로는 정답인데 오답으로 속이려 하면 차단
            if (isActuallyCorrect) {
              console.warn(`⚠️ 부정 시도: 정답을 오답으로 제출 - ${player.nickname || 'Unknown'}`);
              return;
            }
          }
        }

        // 원자적 업데이트로 중복 방지
        const updateResult = await GameSession.findOneAndUpdate(
          {
            _id: sessionId,
            [`players.${playerIndex}.answered.${qIndex}`]: { $ne: true }
          },
          {
            $set: {
              [`players.${playerIndex}.answered.${qIndex}`]: true
            }
          },
          { new: true }
        );

        if (!updateResult) {
          console.log(`⚠️ 중복 답변 방지: 오답 (객관식 문제 ${qIndex})`);
          return;
        }

        session = updateResult;

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

      const userId = socket.userId;
      const player = session.players.find(p => p.userId.toString() === userId.toString());
      const displayName = player?.nickname || 'Unknown';

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

        // 스킵 투표는 현재 접속 중인 플레이어만 기준으로 계산
        const voteRatio = session.skipVotes.length / connectedCount;

        if (voteRatio >= 0.5 && connectedCount > 0) {

          if (session.revealedAt) {
            return;
          }

          const actualQuestionIndex = session.questionOrder[session.currentQuestionIndex];
          const qIndex = String(actualQuestionIndex);
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

      if (session.revealedAt) {
        return;
      }

      const actualQuestionIndex = session.questionOrder[session.currentQuestionIndex];
      const qIndex = String(actualQuestionIndex);
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
      let session = await safeFindSessionById(GameSession, sessionId);
      if (!session) return;

      if (session.revealedAt) return;

      const quiz = await Quiz.findById(session.quizId);
      const orderIndex = session.currentQuestionIndex;
      const actualIndex = session.questionOrder[orderIndex];
      const question = quiz.questions[actualIndex];
      const qIndex = String(actualIndex);

      if (!quiz || !quiz.questions || !quiz.questions[actualIndex]) return;

      const revealedAt = new Date();

      // choiceQuestionCorrectUsers → correctUsers로 데이터 이동 준비
      const updateOps = {
        $set: {
          revealedAt: revealedAt
        }
      };

      // 객관식 정답자 데이터가 있으면 이동
      if (session.choiceQuestionCorrectUsers && session.choiceQuestionCorrectUsers[qIndex]) {
        updateOps.$set[`correctUsers.${qIndex}`] = [...session.choiceQuestionCorrectUsers[qIndex]];
        updateOps.$unset = { [`choiceQuestionCorrectUsers.${qIndex}`]: "" };
      }

      // 원자적 업데이트
      const updateResult = await GameSession.findOneAndUpdate(
        {
          _id: sessionId,
          revealedAt: null
        },
        updateOps,
        { new: true }
      );

      if (!updateResult) {
        console.log('⚠️ 이미 정답이 공개되었거나 세션이 없음 - revealAnswer event');
        return;
      }

      session = updateResult;

      // 현재 문제의 정답자 목록 가져오기
      const correctUsers = session.correctUsers?.[qIndex] || [];

      // 모든 참가자에게 정답 전송
      io.to(sessionId).emit('revealAnswer_Emit', {
        success: true,
        data: {
          answers: question.answers,
          answerImage: question.answerImageBase64,
          index: actualIndex,
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

      // 최적화: $addToSet는 이미 중복을 방지하므로 별도 체크 불필요
      // 인덱스가 있으면 MongoDB가 효율적으로 처리
      const result = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { playedQuizzes: quizId } },
        { new: false } // 업데이트 전 문서 반환 (변경 여부 확인용, 선택사항)
      );

      if (!result) {
        // 사용자가 존재하지 않는 경우
        return;
      }

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
        let session = await safeFindSessionById(GameSession, sessionId);
        if (!session || !session.isActive) return;

        // 중복투표 방지
        if (session.revealedAt) return;

        const quiz = await Quiz.findById(session.quizId);
        const orderIndex = session.currentQuestionIndex;
        const actualIndex = session.questionOrder[orderIndex];
        const question = quiz.questions[actualIndex];
        const qIndex = String(actualIndex);

        const revealedAt = new Date();

        // choiceQuestionCorrectUsers → correctUsers로 데이터 이동 준비
        const updateOps = {
          $set: {
            revealedAt: revealedAt
          }
        };

        // 객관식 정답자 데이터가 있으면 이동
        if (session.choiceQuestionCorrectUsers && session.choiceQuestionCorrectUsers[qIndex]) {
          updateOps.$set[`correctUsers.${qIndex}`] = [...session.choiceQuestionCorrectUsers[qIndex]];
          updateOps.$unset = { [`choiceQuestionCorrectUsers.${qIndex}`]: "" };
        }

        // 원자적 업데이트 + 중복 방지 (revealedAt이 없는 경우만)
        const updateResult = await GameSession.findOneAndUpdate(
          {
            _id: sessionId,
            revealedAt: null // 아직 정답이 공개되지 않은 경우만
          },
          updateOps,
          { new: true }
        );

        if (!updateResult) {
          console.log('⚠️ 이미 정답이 공개되었거나 세션이 없음');
          return;
        }

        session = updateResult;

        // 현재 문제의 정답자 목록 가져오기
        const correctUsers = session.correctUsers?.[qIndex] || [];

        io.to(sessionId).emit('revealAnswer_Emit', {
          success: true,
          data: {
            answers: question.answers,
            answerImage: question.answerImageBase64,
            index: actualIndex,
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

  // 퀴즈 기록 저장 및 퍼센타일 임계값 계산
  async function saveQuizRecordsAndCalculateThresholds(quizId, players) {
    try {
      // 1. playedQuizzes에 해당 퀴즈가 없는 플레이어만 필터링
      const userIds = players.map(p => p.userId);
      const users = await User.find({ _id: { $in: userIds } }).select('_id playedQuizzes').lean();

      const userPlayedQuizzesMap = new Map();
      users.forEach(user => {
        const playedQuizIds = user.playedQuizzes.map(id => id.toString());
        userPlayedQuizzesMap.set(user._id.toString(), playedQuizIds);
      });

      // playedQuizzes에 없는 플레이어만 필터링
      const newPlayers = players.filter(player => {
        const playedQuizzes = userPlayedQuizzesMap.get(player.userId.toString()) || [];
        return !playedQuizzes.includes(quizId.toString());
      });

      // 2. 새로운 플레이어들의 점수 추출
      const newScores = newPlayers.map(p => ({
        score: p.correctAnswersCount || 0,
        userId: p.userId
      }));

      // 3. QuizRecord 업데이트 (upsert)
      let quizRecord = await QuizRecord.findOne({ quizId });

      if (!quizRecord) {
        // 처음 플레이되는 퀴즈
        quizRecord = await QuizRecord.create({
          quizId,
          records: newScores.map(s => ({ score: s.score })),
          totalCount: newScores.length
        });
      } else if (newScores.length > 0) {
        // 기존 기록에 추가 (신규 플레이어가 있을 때만)
        await QuizRecord.findByIdAndUpdate(
          quizRecord._id,
          {
            $push: { records: { $each: newScores.map(s => ({ score: s.score })) } },
            $inc: { totalCount: newScores.length }
          }
        );
        // 업데이트된 데이터 다시 조회
        quizRecord = await QuizRecord.findById(quizRecord._id);
      }

      // 4. playedQuizzes에 퀴즈 추가 (한 번에 처리, 신규 플레이어가 있을 때만)
      if (newScores.length > 0) {
        await User.updateMany(
          { _id: { $in: newScores.map(s => s.userId) } },
          { $addToSet: { playedQuizzes: quizId } }
        );
      }

      // 5. 퍼센타일 임계값 계산 (한 번만 계산!)
      const allScores = quizRecord.records.map(r => r.score).sort((a, b) => b - a);
      const totalPlayers = allScores.length;

      let percentileThresholds = null;

      // 10회 이상일 때만 임계값 계산
      if (totalPlayers >= 10) {
        // 각 퍼센타일의 인덱스 계산
        const top1Index = Math.floor(totalPlayers * 0.01);
        const top3Index = Math.floor(totalPlayers * 0.03);
        const top5Index = Math.floor(totalPlayers * 0.05);
        const top10Index = Math.floor(totalPlayers * 0.10);
        const top30Index = Math.floor(totalPlayers * 0.30);
        const top50Index = Math.floor(totalPlayers * 0.50);

        percentileThresholds = {
          top1: allScores[top1Index] || 0,
          top3: allScores[top3Index] || 0,
          top5: allScores[top5Index] || 0,
          top10: allScores[top10Index] || 0,
          top30: allScores[top30Index] || 0,
          top50: allScores[top50Index] || 0
        };

        // DB에 임계값 저장
        await QuizRecord.findByIdAndUpdate(
          quizRecord._id,
          { $set: { percentileThresholds } }
        );
      }

      // 6. 플레이어 데이터와 임계값 반환 (퍼센트 계산은 클라이언트에서!)
      return {
        players: players.map(p => ({
          nickname: p.nickname,
          profileImage: p.profileImage,
          score: p.score,
          correctAnswersCount: p.correctAnswersCount || 0,
          connected: p.connected
        })),
        percentileThresholds
      };

    } catch (error) {
      console.error('❌ 퀴즈 기록 저장 실패:', error);
      // 에러 발생 시 임계값 없이 반환
      return {
        players: players.map(p => ({
          nickname: p.nickname,
          profileImage: p.profileImage,
          score: p.score,
          correctAnswersCount: p.correctAnswersCount || 0,
          connected: p.connected
        })),
        percentileThresholds: null
      };
    }
  }

  //문제 타이머 함수
  async function goToNextQuestion(sessionId, io, app) {
    try {
      const quizDb = app.get('quizDb');
      const GameSession = require('../models/GameSession')(quizDb);
      const Quiz = require('../models/Quiz')(quizDb);

      if (!ObjectId.isValid(sessionId)) return;
      let session = await safeFindSessionById(GameSession, sessionId);
      if (!session) return;

      const quiz = await Quiz.findById(session.quizId);

      const nextQuestionIndex = session.currentQuestionIndex + 1;

      // 모든 문제를 완료한 경우
      if (nextQuestionIndex >= session.questionOrder.length) {
        // 원자적 업데이트로 게임 종료 처리
        const updateResult = await GameSession.findByIdAndUpdate(
          sessionId,
          {
            $set: {
              isActive: false,
              endedAt: new Date(),
              revealedAt: null,
              currentQuestionIndex: nextQuestionIndex
            },
            $unset: {
              skipVotes: "",
              readyPlayers: ""
            }
          },
          { new: true }
        );

        if (!updateResult) {
          console.error('❌ 세션 저장 중 에러 발생 - goToNextQuestion');
          return;
        }

        session = updateResult;

        // 완료된 게임 수 증가
        await Quiz.findByIdAndUpdate(
          session.quizId,
          { $inc: { completedGameCount: 1 } }
        );

        // 세션 관련 캐시 정리 (메모리 누수 방지)
        if (sessionUserCache.has(sessionId)) {
          sessionUserCache.delete(sessionId);
          console.log(`🧹 세션 캐시 정리: ${sessionId}`);
        }

        // firstCorrectUsers 정리
        if (app.firstCorrectUsers && app.firstCorrectUsers[sessionId]) {
          delete app.firstCorrectUsers[sessionId];
          console.log(`🧹 firstCorrectUsers 정리: ${sessionId}`);
        }

        // 📊 점수 기록 저장 및 퍼센타일 임계값 계산
        const { players: playersData, percentileThresholds } = await saveQuizRecordsAndCalculateThresholds(
          session.quizId,
          session.players
        );

        console.log('🎯 게임 종료 - 임계값:', percentileThresholds);

        io.to(sessionId).emit('end', {
          success: true,
          message: '퀴즈 종료!',
          data: {
            players: playersData,
            percentileThresholds // 클라이언트에서 비교할 임계값 전송
          }
        });
        return;
      }

      // 다음 문제로 이동 (원자적 업데이트)
      const updateResult = await GameSession.findOneAndUpdate(
        {
          _id: sessionId,
          isActive: true // 활성 세션만 업데이트
        },
        {
          $set: {
            revealedAt: null,
            currentQuestionIndex: nextQuestionIndex,
            skipVotes: [],
            readyPlayers: []
          }
        },
        { new: true }
      );

      if (!updateResult) {
        console.error('❌ 세션 저장 중 에러 발생 - goToNextQuestion2');
        return;
      }

      session = updateResult;

      // 문제 데이터만 전송 (타이머 시작 X)
      io.to(sessionId).emit('next', {
        success: true,
        data: {
          currentIndex: session.currentQuestionIndex,
          totalPlayers: session.players.length,
        }
      });
    } catch (error) {
      console.error('❌ Error in goToNextQuestion:', error);
    }
  };

  // 주관식 문제 완료 체크 함수
  async function handleSubjectiveQuestionCompletion(sessionId, io, app) {
    try {
      const GameSession = require('../models/GameSession')(app.get('quizDb'));
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || !session.isActive) return;

      const orderIndex = session.currentQuestionIndex;
      const actualIndex = session.questionOrder[orderIndex];
      const qIndex = String(actualIndex);
      const connectedPlayers = session.players.filter(p => p.connected);
      
      // 모든 플레이어가 답변 완료했는지 체크
      const allAnswered = connectedPlayers.every(player => 
        player.answered && player.answered[qIndex] === true
      );

      if (allAnswered) {
        
        // 정답 공개
        await revealAnswer(sessionId, io, app)();
      }
    } catch (error) {
      console.error('❌ 주관식 완료 체크 에러:', error);
    }
  }

  async function handleChoiceQuestionCompletion(sessionId, io, app, triggerType = 'all_answered') {
    try {
      const GameSession = require('../models/GameSession')(app.get('quizDb'));
      const session = await safeFindSessionById(GameSession, sessionId);
      if (!session || !session.isActive) return;

      const orderIndex = session.currentQuestionIndex;
      const actualIndex = session.questionOrder[orderIndex];
      const qIndex = String(actualIndex);
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
              (p.nickname || 'Unknown') === displayName
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
              player.lastCorrectTime = new Date(); // 정답 맞춘 시간 기록
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
        const question = quiz.questions[actualIndex];

        io.to(sessionId).emit('revealAnswer_Emit', {
          success: true,
          data: {
            answers: question.answers,
            answerImage: question.answerImageBase64,
            index: actualIndex,
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

  // 📊 메모리 모니터링을 위해 캐시 크기 반환
  return {
    getSessionUserCacheSize: () => sessionUserCache.size,
    getDisconnectTimersSize: () => disconnectTimers.size
  };
};