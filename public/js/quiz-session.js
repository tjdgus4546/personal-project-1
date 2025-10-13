// js/quiz-session.js

import { renderNavbar, getUserData, highlightCurrentPage } from './navbar.js';

// 전역 변수들
let currentSendFunction = sendMessage;
let questions = [];
let quizData = null;
let currentIndex = 0;
let questionTimer = null;
let host = null;
let questionStartAt = null;
let countdownInterval = null;
let hasAnswered = false;
let sessionData = null;
let isDataLoaded = false;
let isCodeVisible = false;
let actualInviteCode = '';
let currentWaitingSendFunction = sendWaitingMessage;
let youtubePlayer = null;
let globalYoutubeVolume = 50;
let questionOrder = [];

// Socket.IO 연결
const socket = io();
const sessionId = window.location.pathname.split('/').pop();
let userId = null;

// 인증 확인 함수
async function fetchWithAuth(url, options = {}) {
    options.credentials = 'include';
    let response = await fetch(url, options);

    if (response.status === 401) {
        const refreshResponse = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });

        if (refreshResponse.ok) {
            response = await fetch(url, options);
        } else {
            window.location.href = '/login';
            return;
        }
    }
    return response;
}

// 사용자 정보 가져오기 및 소켓 연결
async function initializeUser() {
    try {
        const response = await fetchWithAuth('/my-info');
        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }
        const userData = await response.json();
        userId = userData._id;

        // Socket이 연결될 때까지 기다린 후 joinSession 실행
        if (socket.connected) {
            socket.emit('joinSession', { sessionId });
        } else {
            socket.on('connect', () => {
                socket.emit('joinSession', { sessionId });
            });
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
        window.location.href = '/login';
    }
}

// 호스트 여부 확인
function isHost() {
    return userId === host;
}

// 세션 데이터 로딩
async function loadSessionData() {
    try {
        const res = await fetchWithAuth(`/game/session/${sessionId}`);

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.message || '세션 정보를 불러오는데 실패했습니다.');
        }
        
        const data = await res.json();

        const profileImageLog = data.players.map(player => {
            return {
                nickname: player.nickname,
                hasImage: !!player.profileImage,
                imageType: player.profileImage ? 
                    (player.profileImage.startsWith('data:') ? 'Base64' : 'URL') : 'None',
                imagePreview: player.profileImage ? player.profileImage.substring(0, 50) + '...' : null
            };
        });
        
        if (!data || !data.quiz || !Array.isArray(data.players)) {
            throw new Error('세션 데이터가 유효하지 않습니다.');
        }

        sessionData = data;
        questions = data.quiz.questions;
        currentIndex = data.currentQuestionIndex;
        questionStartAt = new Date(data.questionStartAt);
        host = data.host;

        // 퀴즈 정보 표시
        displayQuizInfo(data.quiz);
        
       if (data.inviteCode) {
            setInviteCode(data.inviteCode);
        } else {
            document.getElementById('inviteCodeDisplay').textContent = '없음';
        }

        // 스킵 상태 렌더링
        renderSkipStatus(data.skipVotes?.length || 0, data.players?.length || 0);
        
        if (data.isStarted) {
            showGameSection();
            
            if (data.revealedAt) {
                showQuestion({ silent: true });
                renderScoreboard(data.players, false);

                const answers = questions[actualIndex].answers;
                if (answers) {
                    const displayAnswer = Array.isArray(answers) ? answers[0] : answers;
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'answer-reveal';
                    answerDiv.innerHTML = `<h3>정답 공개</h3><p>${displayAnswer}</p>`;
                    document.getElementById('questionBox').appendChild(answerDiv);
                }

                const answerImage = questions[currentIndex]?.answerImageBase64;
                if (answerImage) {
                    const img = document.createElement('img');
                    img.src = answerImage;
                    img.alt = '정답 이미지';
                    img.className = 'question-image';
                    document.getElementById('questionBox').appendChild(img);
                }

                window.__isRevealingAnswer = true;
                const elapsed = (Date.now() - new Date(data.revealedAt)) / 1000;
                const wait = Math.max(0, 5 - elapsed);
                setTimeout(() => {
                    window.__isRevealingAnswer = false;
                    if (isHost()) {
                        socket.emit('nextQuestion', { sessionId, userId });
                    }
                }, wait * 1000);
            } else {
                showQuestion();
                renderScoreboard(data.players, false);
            }
        } else {
            showQuizInfoSection();
        }

    } catch (err) {
        console.error('세션 로딩 실패:', err);
        if (err.message === '세션 없음') {
            location.href = '/';
        } else {
            alert(err.message || '세션 정보를 불러오는 중 오류가 발생했습니다.');
            location.href = '/';
        }
    }
}

// 퀴즈 정보 표시
function displayQuizInfo(quiz) {
    document.getElementById('quizTitle').textContent = quiz.title;
    document.getElementById('quizDescription').textContent = quiz.description || '이 퀴즈에 도전해보세요!';
    document.getElementById('totalQuestions').textContent = quiz.questions.length;

    // 썸네일 이미지 표시
    const thumbnailContainer = document.getElementById('quizThumbnail');
    if (quiz.titleImageBase64) {
        thumbnailContainer.innerHTML = `
            <img src="${quiz.titleImageBase64}" alt="${quiz.title}" 
                 class="w-full h-full object-cover rounded-xl">
        `;
    }

    // 초대코드 표시 및 버튼 활성화
    const inviteCodeDisplay = document.getElementById('inviteCodeDisplay');
    const copyBtn = document.getElementById('copyInviteBtn');
  
    if (sessionData && sessionData.inviteCode) {
        inviteCodeDisplay.textContent = sessionData.inviteCode;
        copyBtn.disabled = false;
        copyBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// 퀴즈 정보 섹션 표시
function showQuizInfoSection() {
    document.getElementById('quizInfoSection').classList.remove('hidden');
    document.getElementById('gameSection').classList.add('hidden');
    
    // 데스크톱 버튼 숨기기
    document.getElementById('voteSkipBtn').classList.add('hidden');
    document.getElementById('forceSkipBtn').classList.add('hidden');
    
    // 모바일 버튼 숨기기
    document.getElementById('voteSkipBtnMobile').classList.add('hidden');
    document.getElementById('forceSkipBtnMobile').classList.add('hidden');
    
    document.getElementById('skipStatus').classList.add('hidden');
}

// 게임 섹션 표시
function showGameSection() {
    document.getElementById('quizInfoSection').classList.add('hidden');
    document.getElementById('gameSection').classList.remove('hidden');
    
    // 데스크톱 스킵투표 버튼 표시
    document.getElementById('voteSkipBtn').classList.remove('hidden');
    
    // 모바일 스킵투표 버튼 표시
    document.getElementById('voteSkipBtnMobile').classList.remove('hidden');
    
    document.getElementById('skipStatus').classList.remove('hidden');
    
    // 호스트인 경우 강제스킵 버튼 표시
    if (userId === host) {
        document.getElementById('forceSkipBtn').classList.remove('hidden');
        document.getElementById('forceSkipBtnMobile').classList.remove('hidden');
    }
}

// 점수판 렌더링
function renderScoreboard(players) {
    const board = document.getElementById('scoreboard');
    board.innerHTML = '';

    const sortedPlayers = players
        .filter(p => p.connected)
        .slice()
        .sort((a, b) => b.score - a.score);

    sortedPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'flex-shrink-0 w-[140px] p-3 bg-gray-700/50 rounded-lg border-l-4 border-blue-400';
        
        const avatarHTML = createPlayerAvatar(p);
        const displayName = p.nickname || 'Unknown';
        
        li.innerHTML = `
            <div class="flex items-center justify-center gap-3 mb-2">
                <span class="text-yellow-400 font-bold text-sm">#${index + 1}</span>
                ${avatarHTML}
            </div>
            <div class="text-center">
                <div class="text-white font-medium text-sm truncate mb-1">${displayName}</div>
                <div class="text-green-400 font-bold text-lg">${p.score}점</div>
                <div class="text-gray-400 text-xs">${p.correctAnswersCount || 0}문제</div>
            </div>
        `;
        board.appendChild(li);
    });

}

function updateQuestionNumber() {
    const questionNumberElement = document.getElementById('currentQuestionNumber');
    if (questionNumberElement && questions && questions.length > 0) {
        const current = currentIndex + 1;
        const total = questions.length;
        questionNumberElement.textContent = `문제 ${current} / ${total}`;
    }
}


// 참가자 목록 렌더링
function renderPlayerList(players) {
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = '';

    const connectedPlayers = players.filter(p => p.connected);
    
    connectedPlayers.forEach(player => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors';
        
        // 프로필 이미지 또는 이니셜 아바타 생성
        const avatarHTML = createPlayerAvatar(player);
        
        const displayName = player.nickname || 'Unknown';
        
        li.innerHTML = `
            <div class="flex items-center space-x-3">
                ${avatarHTML}
                <span class="text-white font-medium">${displayName}</span>
            </div>
        `;

        playerList.appendChild(li);
    });

    // 참가자 수 업데이트
    const totalCountElement = document.getElementById('totalPlayerCount');
    if (totalCountElement) {
        totalCountElement.textContent = connectedPlayers.length;
    }
    
    // 스크롤 힌트 표시/숨김
    const scrollHint = document.getElementById('scrollHint');
    const playerListContainer = document.querySelector('.max-h-64');
    
    if (scrollHint && playerListContainer) {
        const containerHeight = playerListContainer.clientHeight;
        const contentHeight = playerListContainer.scrollHeight;
        
        if (contentHeight > containerHeight) {
            scrollHint.classList.remove('hidden');
        } else {
            scrollHint.classList.add('hidden');
        }
    }

    // 대기실 볼륨 슬라이더에 저장된 값 적용
    const waitingVolumeSlider = document.getElementById('waitingVolumeSlider');
    const waitingVolumePercent = document.getElementById('waitingVolumePercent');
    
    if (waitingVolumeSlider) {
        waitingVolumeSlider.value = globalYoutubeVolume;
    }
    if (waitingVolumePercent) {
        waitingVolumePercent.textContent = `${globalYoutubeVolume}%`;
    }
}

// 플레이어 아바타 생성 함수
function createPlayerAvatar(player) {
    const displayName = player.nickname || 'Unknown';
    const initial = displayName.charAt(0).toUpperCase();
    
    // 프로필 이미지가 있고 네이버 기본 이미지가 아닌 경우
    if (player.profileImage && 
        player.profileImage !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png' && 
        player.profileImage.trim() !== '') {
        
        return `
            <div class="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                <img 
                    src="${player.profileImage}" 
                    alt="${displayName}님의 프로필" 
                    class="w-full h-full object-cover"
                    onerror="console.log('⌧ 이미지 로딩 실패:', '${player.profileImage.substring(0, 30)}...'); this.style.display='none'; this.nextElementSibling.style.display='flex';"
                >
                <div class="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm" style="display: none;">
                    ${initial}
                </div>
            </div>
        `;
    } else {
        // 기본 이니셜 아바타
        return `
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                ${initial}
            </div>
        `;
    }
}

// 스킵 투표 상태 렌더링
function renderSkipStatus(voted, total) {
    document.getElementById('skipStatus').querySelector('span').textContent = `스킵 투표: ${voted} / ${total}`;
}

// 채팅 기록 불러오기
async function loadChatHistory() {
    try {
        const startTime = Date.now();
        const res = await fetchWithAuth(`/game/chat/${sessionId}`);
        const data = await res.json();
        
        const chatLog = document.getElementById('chatLog');
        
        // DocumentFragment 사용으로 DOM 조작 최적화
        const fragment = document.createDocumentFragment();
        
        data.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'p-3 rounded-lg bg-gray-700/50 border-l-4 border-blue-400';
            
            const displayName = msg.nickname || 'Unknown';
            
            messageDiv.innerHTML = `<span class="text-blue-400 font-medium">${displayName}:</span> <span class="text-gray-200">${msg.message}</span>`;
            fragment.appendChild(messageDiv);
        });
        
        chatLog.appendChild(fragment);
        chatLog.scrollTop = chatLog.scrollHeight;
    } catch (err) {
        console.error('채팅 기록 불러오기 실패:', err);
    }
}

// 일반 메시지 전송
function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    input.value = '';

    if (!message) return;

    const actualIndex = questionOrder[currentIndex];
    const rawAnswers = questions[actualIndex].answers || [];
    const answers = rawAnswers.map(a => a.replace(/\s+/g, '').toLowerCase());
    const userInput = message.replace(/\s+/g, '').toLowerCase();
    
    const isCorrect = answers.includes(userInput);

    if (!window.__isRevealingAnswer && isCorrect) {
        socket.emit('correct', { sessionId });
    } else {
        socket.emit('chatMessage', { sessionId, message });
    }
}

// 객관식 문제 메시지 전송
function choiceQuestionSendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    input.value = '';

    if (!message) return;
    socket.emit('chatMessage', { sessionId, message });
}

// 문제 표시
function showQuestion({ silent = false } = {}) {
    const box = document.getElementById('questionBox');
    const actualIndex = questionOrder[currentIndex];
    const question = questions[actualIndex];
    const answers = questions[actualIndex]?.answers;

    if (!question) {
        console.error('문제를 찾을 수 없습니다:', currentIndex);
        return;
    }

    box.innerHTML = '';
    hasAnswered = false;

    let html = '';
    updateQuestionNumber();
    
    // 문제 타입 확인
    const questionType = question.questionType || 'text';
    
    // ========== 이미지 문제 (기존 로직 유지) ==========
    if (question.imageBase64) {
        html += `<img src="${question.imageBase64}" alt="문제 이미지" class="w-auto h-auto max-h-[300px] mx-auto rounded-lg shadow-lg my-4">`;
    }

    // ========== YouTube 비디오 처리 (YouTube API 사용) ==========
    if (question.youtubeUrl) {
        const videoId = extractYoutubeVideoId(question.youtubeUrl);
        const startTime = question.youtubeStartTime || 0;
        const endTime = question.youtubeEndTime || 0;
        
        if (videoId) {
            // 영상 문제 (video) - YouTube API 사용
            if (questionType === 'video') {
                html += `
                    <div class="youtube-player-wrapper max-w-2xl mx-auto my-3 relative">
                        <div class="relative" style="padding-bottom: 56.25%; height: 0;">
                            <!-- YouTube 플레이어가 여기에 생성됨 -->
                            <div id="youtubePlayerVideo" class="absolute top-0 left-0 w-full h-full rounded-lg" style="pointer-events: none;"></div>
                            
                            <!-- 제목 가리는 검은색 오버레이 + 볼륨 컨트롤 -->
                            <div class="absolute top-0 left-0 w-full h-16 bg-black flex items-center justify-end px-4 rounded-t-lg z-10">
                                <div class="flex items-center gap-3">
                                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                                    </svg>
                                    <input 
                                        type="range" 
                                        id="youtubeVolumeSlider"
                                        class="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-white" 
                                        min="0" 
                                        max="100" 
                                        value="${globalYoutubeVolume}"
                                        oninput="setYoutubeVolume(this.value)"
                                        style="pointer-events: auto;"
                                    >
                                    <span id="volumePercent" class="text-white font-medium text-sm min-w-[45px]">${globalYoutubeVolume}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // DOM 업데이트 후 플레이어 생성
                box.innerHTML = html;
                
                // 객관식/주관식 문제 UI 추가
                if (question.isChoice && question.choices && question.choices.length > 0) {
                    currentSendFunction = choiceQuestionSendMessage;
                    html = `<div class="text-gray-200 mb-1">${question.text}</div>`;
                    html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-1 justify-items-center w-full max-w-[660px] mx-auto px-4">`;
                    
                    question.choices.forEach((choice, index) => {
                        const keyNumber = index + 1;
                        html += `
                            <button                          
                            onclick="selectChoice('${choice}')"
                            data-choice-index="${index}"
                            class="choice-btn w-full max-w-[200px] min-h-[20px] lg:max-h-[52px] hover:bg-blue-600 border-2 border-gray-600 text-white py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg text-[14px] disabled:transform-none break-words leading-tight relative"                     
                            >
                            <span class="absolute top-1 left-2 text-xs text-gray-400 font-bold">${keyNumber}</span>
                            ${choice}
                            </button>
                        `;
                    });
                    html += `</div>`;
                    box.innerHTML += html;
                } else {
                    currentSendFunction = sendMessage;
                    box.innerHTML += `<div class="text-gray-200 mb-2 max-h-[38px]">${question.text}</div>`;
                }
                
                setTimeout(() => {
                    createYoutubePlayer(videoId, startTime, endTime, 'youtubePlayerVideo');
                }, 100);
                
                // 타이머 시작
                if (!silent) {
                    if (questionTimer) clearTimeout(questionTimer);
                    if (countdownInterval) clearInterval(countdownInterval);

                    const timeLimit = (question.timeLimit || 90) * 1000;
                    questionTimer = setTimeout(() => {
                        if (isHost()) {
                            socket.emit('revealAnswer', { sessionId });
                        }
                    }, timeLimit);

                    startCountdown(question.timeLimit || 90);
                }
                return;
            }
            // 소리 문제 (audio) - 영상 가리기 + YouTube API 사용
            else if (questionType === 'audio') {
                html += `
                    <div class="youtube-player-wrapper max-w-2xl mx-auto my-3 relative">
                        <div class="relative" style="padding-bottom: 56.25%; height: 0;">
                            <!-- YouTube 플레이어 (보이지 않음) -->
                            <div id="youtubePlayerAudio" class="absolute top-0 left-0 w-full h-full rounded-lg" style="pointer-events: none;"></div>
                            
                            <!-- 영상 가리는 검은색 오버레이 -->
                            <div class="absolute inset-0 bg-black rounded-lg flex flex-col items-center justify-center z-10">
                                <div class="text-center mb-8">
                                    <svg class="w-24 h-24 text-white mx-auto mb-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
                                    </svg>
                                    <p class="text-2xl font-bold text-white">소리를 듣고 맞춰보세요!</p>
                                </div>
                                
                                <!-- 볼륨 컨트롤 -->
                                <div class="flex items-center gap-3 bg-gray-800/80 px-6 py-3 rounded-full border-2 border-gray-600">
                                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                                    </svg>
                                    <input 
                                        type="range" 
                                        id="youtubeVolumeSlider"
                                        class="w-32 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-white" 
                                        min="0" 
                                        max="100" 
                                        value="${globalYoutubeVolume}"
                                        oninput="setYoutubeVolume(this.value)"
                                        style="pointer-events: auto;"
                                    >
                                    <span id="volumePercent" class="text-white font-bold text-lg min-w-[50px]">${globalYoutubeVolume}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // DOM 업데이트 후 플레이어 생성
                box.innerHTML = html;
                
                // 객관식/주관식 문제 UI 추가
                if (question.isChoice && question.choices && question.choices.length > 0) {
                    currentSendFunction = choiceQuestionSendMessage;
                    html = `<div class="text-gray-200 mb-1">${question.text}</div>`;
                    html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-1 justify-items-center w-full max-w-[660px] mx-auto px-4">`;
                    
                    question.choices.forEach((choice, index) => {
                        const keyNumber = index + 1;
                        html += `
                            <button                          
                            onclick="selectChoice('${choice}')"
                            data-choice-index="${index}"
                            class="choice-btn w-full max-w-[200px] min-h-[20px] lg:max-h-[52px] hover:bg-blue-600 border-2 border-gray-600 text-white py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg text-[14px] disabled:transform-none break-words leading-tight relative"                     
                            >
                            <span class="absolute top-1 left-2 text-xs text-gray-400 font-bold">${keyNumber}</span>
                            ${choice}
                            </button>
                        `;
                    });
                    html += `</div>`;
                    box.innerHTML += html;
                } else {
                    currentSendFunction = sendMessage;
                    box.innerHTML += `<div class="text-gray-200 mb-2 max-h-[38px]">${question.text}</div>`;
                }
                
                setTimeout(() => {
                    createYoutubePlayer(videoId, startTime, endTime, 'youtubePlayerAudio');
                }, 100);
                
                // 타이머 시작
                if (!silent) {
                    if (questionTimer) clearTimeout(questionTimer);
                    if (countdownInterval) clearInterval(countdownInterval);

                    const timeLimit = (question.timeLimit || 90) * 1000;
                    questionTimer = setTimeout(() => {
                        if (isHost()) {
                            socket.emit('revealAnswer', { sessionId });
                        }
                    }, timeLimit);

                    startCountdown(question.timeLimit || 90);
                }
                return;
            }
            // questionType이 없는 기존 유튜브 문제 (기본: video 처리)
            else {
                html += `
                    <div class="youtube-player-wrapper max-w-2xl mx-auto my-3 relative">
                        <div class="relative" style="padding-bottom: 56.25%; height: 0;">
                            <!-- YouTube 플레이어가 여기에 생성됨 -->
                            <div id="youtubePlayerVideo" class="absolute top-0 left-0 w-full h-full rounded-lg" style="pointer-events: none;"></div>
                            
                            <!-- 제목 가리는 검은색 오버레이 + 볼륨 컨트롤 -->
                            <div class="absolute top-0 left-0 w-full h-16 bg-black flex items-center justify-end px-4 rounded-t-lg z-10">
                                <div class="flex items-center gap-3">
                                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                                    </svg>
                                    <input 
                                        type="range" 
                                        id="youtubeVolumeSlider"
                                        class="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-white" 
                                        min="0" 
                                        max="100" 
                                        value="${globalYoutubeVolume}"
                                        oninput="setYoutubeVolume(this.value)"
                                        style="pointer-events: auto;"
                                    >
                                    <span id="volumePercent" class="text-white font-medium text-sm min-w-[45px]">${globalYoutubeVolume}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // DOM 업데이트
                box.innerHTML = html;
                
                // 플레이어 생성
                setTimeout(() => {
                    createYoutubePlayer(videoId, startTime, endTime, 'youtubePlayerVideo');
                }, 100);
            }
        }
    }

    // ========== 객관식 문제 ==========
    if (question.isChoice && question.choices && question.choices.length > 0) {
        currentSendFunction = choiceQuestionSendMessage;
        html += `<div class="text-gray-200 mb-1">${question.text}</div>`;
        html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-1 justify-items-center w-full max-w-[660px] mx-auto px-4">`;
        
        try {
            question.choices.forEach((choice, index) => {
                const keyNumber = index + 1;
                html += `
                    <button                          
                    onclick="selectChoice('${choice}')"
                    data-choice-index="${index}"
                    class="choice-btn w-full max-w-[200px] min-h-[20px] lg:max-h-[52px] hover:bg-blue-600 border-2 border-gray-600 text-white py-2 px-4 rounded-xl transition-all duration-200 transform hover:scale-105 shadow-lg text-[14px] disabled:transform-none break-words leading-tight relative"                     
                    >
                    <span class="absolute top-1 left-2 text-xs text-gray-400 font-bold">${keyNumber}</span>
                    ${choice}
                    </button>
                `;
            });
            html += `</div>`;
        } catch (error) {
            console.error('객관식 문제를 불러올수 없습니다:', error);
        }
    } else {
        currentSendFunction = sendMessage;
        html += `<div class="text-gray-200 mb-2 max-h-[38px]">${question.text}</div>`;
    }

    box.innerHTML = html;

    if (silent) return;

    if (questionTimer) clearTimeout(questionTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    const timeLimit = (question.timeLimit || 90) * 1000;
    questionTimer = setTimeout(() => {
        if (isHost()) {
            socket.emit('revealAnswer', { sessionId });
        }
    }, timeLimit);

    startCountdown(question.timeLimit || 90);
}

// 객관식 선택 처리
function selectChoice(choice) {
    if (hasAnswered) return;

    hasAnswered = true;

    // 모든 선택지 버튼 가져오기
    const allButtons = document.querySelectorAll('.choice-btn');

    // 클릭한 버튼 찾기 (onclick 속성으로 비교)
    let selectedButton = null;
    allButtons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${choice}'`)) {
            selectedButton = btn;
        }
    });

    // 선택한 버튼 강조 및 다른 버튼들 비활성화
    if (selectedButton) {
        // 선택한 버튼 스타일
        selectedButton.classList.remove('hover:bg-blue-600', 'border-gray-600');
        selectedButton.classList.add('bg-blue-600', 'border-blue-400', 'ring-2', 'ring-blue-400');
        selectedButton.disabled = true;

        // 다른 버튼들 비활성화 스타일
        allButtons.forEach(btn => {
            if (btn !== selectedButton) {
                btn.classList.add('opacity-40', 'cursor-not-allowed');
                btn.disabled = true;
            }
        });
    }
    
    const actualIndex = questionOrder[currentIndex];
    const rawAnswers = questions[actualIndex].answers || [];
    const answers = rawAnswers.map(a => a.replace(/\s+/g, '').toLowerCase());
    const userInput = choice.replace(/\s+/g, '').toLowerCase();
    
    const isCorrect = answers.includes(userInput);

    if (!window.__isRevealingAnswer && isCorrect) {
        socket.emit('choiceQuestionCorrect', { sessionId });
    } else {
        socket.emit('choiceQuestionIncorrect', { sessionId });
    }
}

// 게임 채팅 메시지 추가 (프로필 이미지 포함)
function addChatMessage(displayName, profileImage, message, isCorrect = false) {
    try {
        const chatLog = document.getElementById('chatLog');
        
        if (!chatLog) {
            console.error('⌧ chatLog 요소를 찾을 수 없음');
            return;
        }
        
        // 마지막 메시지가 같은 사용자인지 확인
        const lastMessage = chatLog.lastElementChild;
        const isSameUser = lastMessage && 
                          lastMessage.getAttribute('data-user') === displayName &&
                          !isCorrect; // 정답 메시지는 항상 프로필 표시
        
        const messageElement = document.createElement('div');
        messageElement.setAttribute('data-user', displayName);
        
        if (isSameUser) {
            // 연속 메시지: 프로필 없이 텍스트만 표시
            messageElement.className = 'flex items-start text-left translate-y-[-3px] pl-[56px]';
            messageElement.innerHTML = `
                <div class="text-white text-sm break-words max-w-[1000px]">
                    ${message}
                </div>
            `;
        } else {
            // 새로운 메시지: 프로필과 함께 표시
            messageElement.className = 'flex items-start mt-2';
            
            if (isCorrect) {
                // 정답 메시지 스타일
                if (profileImage && profileImage !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png') {
                    messageElement.innerHTML = `
                        <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                            <img src="${profileImage}"
                            class="mt-1 w-8 h-8 mr-3 rounded-full object-cover border-2 border-green-400/50 flex-shrink-0"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                            >
                            <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm border-2 border-green-400/50 flex-shrink-0" style="display: none;">
                                ${displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="flex items-start font-semibold text-sm text-green-400 mb-1">${displayName}</div>
                                <div class="text-green-200 text-sm break-words flex items-start">${message}</div>
                            </div>
                        </div>
                    `;
                } else {
                    messageElement.innerHTML = `
                        <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                            <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm border-2 border-green-400/50 flex-shrink-0">
                                ${displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="font-semibold text-sm text-green-400 mb-1">${displayName}</div>
                                <div class="text-green-200 text-sm break-words flex items-start">${message}</div>
                            </div>
                        </div>
                    `;
                }
            } else {
                // 일반 메시지 스타일
                if (profileImage && profileImage !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png') {
                    messageElement.innerHTML = `
                        <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                            <img src="${profileImage}"
                            class="mt-1 w-8 h-8 mr-3 rounded-full object-cover border-2 border-white/20 flex-shrink-0"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                            >
                            <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20 flex-shrink-0" style="display: none;">
                                ${displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="font-semibold text-sm text-white mt-1">${displayName}</div>
                                <div class="text-white text-sm break-words flex items-start">${message}</div>
                            </div>
                        </div>
                    `;
                } else {
                    messageElement.innerHTML = `
                        <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                            <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20 flex-shrink-0">
                                ${displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div class="font-semibold text-sm text-white mb-1">${displayName}</div>
                                <div class="text-white text-sm break-words flex items-start">${message}</div>
                            </div>
                        </div>
                    `;
                }
            }
        }
        
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        
    } catch (error) {
        console.error('⌧ addChatMessage 에러:', error);
        console.error('에러 스택:', error.stack);
    }
}

// 정답 표시
function showAnswer({ answers, answerImageBase64, revealedAt }) {
    const box = document.getElementById('questionBox');

    // 기존 내용 완전히 지우기
    box.innerHTML = '';

    let html = '';
    
    // 정답 이미지 (있는 경우)
    if (answerImageBase64) {
        html += `
                <img src="${answerImageBase64}" 
                     alt="정답 이미지" 
                     class="w-auto h-auto max-h-[300px] mx-auto rounded-lg shadow-lg my-4">
        `;
    }

    // 정답 텍스트 섹션
    if (answers) {
        html += `
            <div class="flex answer-reveal justify-center text-center mb-1">
                <h3 class="text-green-400 font-bold">정답 :&nbsp</h3>
                <div class="text-green-200 font-semibold">
                    ${displayAnswer}
                </div>
            </div>
        `;
    }

    box.innerHTML = html;

    // ✅ 정답 공개 상태 설정
    window.__isRevealingAnswer = true;

    // ✅ 5초 후 다음 문제로 넘어가기
    const elapsed = (Date.now() - new Date(revealedAt).getTime()) / 1000;
    const waitTime = Math.max(0, 5 - elapsed);

    setTimeout(() => {
        window.__isRevealingAnswer = false;
        if (isHost()) {
            socket.emit('nextQuestion', { sessionId, userId });
        }
    }, waitTime * 1000);
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 스킵 투표 버튼
    document.getElementById('voteSkipBtn').addEventListener('click', () => {
        socket.emit('voteSkip', { sessionId });
    });

    // 강제 스킵 버튼
    document.getElementById('forceSkipBtn').addEventListener('click', () => {
        socket.emit('forceSkip', { sessionId });
    });

    // 모바일 스킵 투표 버튼
    document.getElementById('voteSkipBtnMobile').addEventListener('click', () => {
        socket.emit('voteSkip', { sessionId });
    });

    // 모바일 강제 스킵 버튼
    document.getElementById('forceSkipBtnMobile').addEventListener('click', () => {
        socket.emit('forceSkip', { sessionId });
    });

    // 채팅 입력 엔터 키
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentSendFunction();
        }
    });

    document.addEventListener('keydown', handleChoiceKeyPress);

    // ESC 키: 포커스 해제
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'TEXTAREA') {
                document.activeElement.blur();
            }
        }
    });

    // Enter 키: 채팅창 포커스
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (document.activeElement.tagName !== 'INPUT' && 
                document.activeElement.tagName !== 'TEXTAREA' &&
                document.activeElement.tagName !== 'BUTTON') {
                
                const gameSection = document.getElementById('gameSection');
                const quizInfoSection = document.getElementById('quizInfoSection');
                
                if (!gameSection.classList.contains('hidden')) {
                    document.getElementById('chatInput').focus();
                } else if (!quizInfoSection.classList.contains('hidden')) {
                    document.getElementById('waitingChatInput').focus();
                }
            }
        }
    });

    // K 키: 스킵 투표
    document.addEventListener('keydown', (e) => {
        if (e.key === 'k' || e.key === 'K') {
            if (document.activeElement.tagName !== 'INPUT' && 
                document.activeElement.tagName !== 'TEXTAREA') {
                
                const gameSection = document.getElementById('gameSection');
                
                if (!gameSection.classList.contains('hidden')) {
                    const voteSkipBtn = document.getElementById('voteSkipBtn');
                    const voteSkipBtnMobile = document.getElementById('voteSkipBtnMobile');
                    
                    if (!voteSkipBtn.classList.contains('hidden') || 
                        !voteSkipBtnMobile.classList.contains('hidden')) {
                        socket.emit('voteSkip', { sessionId });
                        
                        // 시각적 피드백
                        [voteSkipBtn, voteSkipBtnMobile].forEach(btn => {
                            if (!btn.classList.contains('hidden')) {
                                btn.classList.add('scale-95', 'opacity-70');
                                setTimeout(() => {
                                    btn.classList.remove('scale-95', 'opacity-70');
                                }, 150);
                            }
                        });
                    }
                }
            }
        }
    });

    const toggleCodeBtn = document.getElementById('toggleCodeBtn');
    if (toggleCodeBtn) {
        toggleCodeBtn.addEventListener('click', toggleCodeVisibility);
    }

    const copyInviteBtn = document.getElementById('copyInviteBtn');
    if (copyInviteBtn) {
        copyInviteBtn.addEventListener('click', copyInviteCode);
    }

    const waitingChatInput = document.getElementById('waitingChatInput');
    if (waitingChatInput) {
        waitingChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentWaitingSendFunction();
            }
        });
    }
}

// Socket 이벤트 리스너들
function setupSocketListeners() {
    // Socket 연결 상태 모니터링
    socket.on('connect', () => {
        // 이미 사용자 정보가 있다면 즉시 joinSession 실행
        if (userId ) {
            socket.emit('joinSession', { sessionId });
        }
    });

    socket.on('session-ready', () => {
        loadSessionData();
    });

    socket.on('waiting-room', ({ success, data, message }) => {

        if (!success) {
            console.error('대기실 로딩 실패:', message || '알 수 없는 오류');
            return;
        }

        const { host: newHost, players, isStarted } = data;
        host = newHost;
        
        // 참가자 목록 업데이트
        renderPlayerList(players);

        // 호스트만 시작 버튼 표시
        const startBtn = document.getElementById('startBtn');
        if (userId === host && !isStarted) {
            startBtn.classList.remove('hidden');
            startBtn.onclick = () => {
                socket.emit('startGame', { sessionId, userId });
                startBtn.disabled = true;
                startBtn.textContent = '게임 시작 중...';
            };
        } else {
            startBtn.classList.add('hidden');
        }
    });

    socket.on('game-started', ({ success, data, message }) => {
        if (!success) {
            console.error('게임 시작 실패:', message);
            alert(message || '게임을 시작할 수 없습니다.');
            return;
        }

        const { quiz, host: newHost, questionStartAt: startAt, questionOrder: order } = data;

        if (!quiz || !Array.isArray(quiz.questions)) {
            console.error('잘못된 퀴즈 구조:', quiz);
            alert('퀴즈 데이터가 손상되었습니다.');
            return;
        }

        host = newHost;

        // quizData 저장
        quizData = quiz;
        
        // 문제 순서 배열 저장 (서버에서 전송받은 순서 또는 기본 순서)
        questionOrder = order || Array.from({ length: quiz.questions.length }, (_, i) => i);
        
        // 객관식 문제의 선택지 섞기
        questions = quiz.questions.map(question => {
            if (question.incorrectAnswers && question.incorrectAnswers.length > 0) {
                // 정답 + 오답 섞기
                const allChoices = [...question.answers, ...question.incorrectAnswers];
                
                // Fisher-Yates 셔플
                for (let i = allChoices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allChoices[i], allChoices[j]] = [allChoices[j], allChoices[i]];
                }
                
                return {
                    ...question,
                    isChoice: true,
                    choices: allChoices
                };
            }
            
            return {
                ...question,
                isChoice: false
            };
        });
        
        currentIndex = 0;
        questionStartAt = new Date(startAt);

        showGameSection();
        showQuestion();
        updateQuestionNumber();
    });

    socket.on('host-updated', ({ success, data, message }) => {
        if (!success) {
            console.error('호스트 갱신 실패:', message);
            return;
        }

        host = data.host;

        const isGameStarted = !document.getElementById('gameSection').classList.contains('hidden');
        const startBtn = document.getElementById('startBtn');
        
        // 데스크톱 버튼
        const forceSkipBtn = document.getElementById('forceSkipBtn');
        // 모바일 버튼
        const forceSkipBtnMobile = document.getElementById('forceSkipBtnMobile');

        if (host === '__NONE__') {
            forceSkipBtn.classList.add('hidden');
            forceSkipBtnMobile.classList.add('hidden');
            startBtn?.classList.add('hidden');
        } else if (userId === host) {
            if (isGameStarted) {
                forceSkipBtn.classList.remove('hidden');
                forceSkipBtnMobile.classList.remove('hidden');
            }
            if (!isGameStarted) {
                startBtn?.classList.remove('hidden');
            }
        } else {
            forceSkipBtn.classList.add('hidden');
            forceSkipBtnMobile.classList.add('hidden');
            startBtn?.classList.add('hidden');
        }
    });

    socket.on('voteSkipUpdate', ({ success, data, votes, total }) => {
        if (success === false && data === undefined) {
            renderSkipStatus(votes, total);
        } else {
            if (data) {
                renderSkipStatus(data.votes, data.total);
            }
        }
    });

    socket.on('next', ({ success, data, message }) => {
        if (!success) {
            console.error('다음 문제 전송 실패:', message);
            return;
        }

        const { currentIndex: newIndex, questionStartAt: startAt, totalPlayers } = data;
        currentIndex = newIndex;
        questionStartAt = new Date(startAt);
        renderSkipStatus(0, totalPlayers);
        showQuestion();  // showQuestion 안에서 updateQuestionNumber 호출
    });

    socket.on('chat', ({ user, nickname, profileImage, message }) => {
        const displayName = nickname || user;
        const isMyMessage = user === socket.userId;;
        
        if (gameSection.classList.contains('hidden')) {
            displayWaitingChat(displayName, profileImage, message, isMyMessage);
        } else {
            addChatMessage(displayName, profileImage, message, false);
        }
    });

    socket.on('correct', ({ success, data, message }) => {
        if (!success) {
            console.error('⌧ 정답 수신 실패:', message);
            return;
        }

        const { nickname, profileImage } = data;
        
        addChatMessage(nickname, profileImage, `${nickname}님이 정답을 맞혔습니다!`, true);
    });
    
    socket.on('scoreboard', ({ success, message, data }) => {

        if (!success) {
            console.error('점수판 로딩 실패:', message);
            return;
        }
        renderScoreboard(data.players);
    });

    socket.on('choiceQuestionScoreboard', ({ success, message, data }) => {
        if (!success) {
            console.error('점수판 로딩 실패:', message);
            return;
        }

        renderScoreboard(data.players);

        if (isHost()) {
            socket.emit('revealAnswer', { sessionId });
        }
    });

    socket.on('revealAnswer_Emit', ({ success, data, message }) => {
        if (!success) {
            console.error('정답 공개 실패:', message);
            return;
        }

        const { answers, answerImage, revealedAt, correctUsers } = data;

        // ✅ 2. 채팅창에 정답자 표시
        displayCorrectUsersInChat(correctUsers);

        // ✅ 3. 정답 공개 화면 표시 (유튜브 포함)
        showAnswerWithYoutube({
            answers,
            answerImageBase64: answerImage,
            revealedAt,
            index: data.index
        });
    });

    socket.on('end', ({ success, message }) => {
        if (!success) {
            console.error('퀴즈 종료 오류:', message);
            return;
        }
        alert('퀴즈가 모두 끝났습니다! 수고하셨습니다.');
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    });

    socket.on('forceRedirect', (data) => {
        alert('세션이 종료되어 메인 페이지로 이동합니다.');
        window.location.href = data.url || '/';
    });
}

// 페이지 초기화
async function initializePage() {
    try {
        // Socket 이벤트 리스너 먼저 설정
        setupSocketListeners();
        setupEventListeners();

        window.addEventListener('beforeunload', () => {
            document.removeEventListener('keydown', handleChoiceKeyPress);
        });
                
        // 병렬로 실행하여 로딩 시간 단축
        const [user] = await Promise.all([
            renderNavbar(),
            // 다른 독립적인 작업들도 여기에 추가 가능
        ]);
        
        highlightCurrentPage();
        
        // 로그인 체크
        if (!user) {
            window.location.href = '/login?message=' + encodeURIComponent('로그인이 필요합니다.');
            return;
        }
        
        // 사용자 정보 초기화
        await initializeUser();
        
        // 채팅 기록은 비동기로 로드 (페이지 로딩 속도에 영향 없음)
        loadChatHistory().catch(err => console.error('채팅 기록 로딩 실패:', err));
        
        
    } catch (error) {
        console.error('페이지 초기화 실패:', error);
        alert('페이지 초기화 중 오류가 발생했습니다.');
        window.location.href = '/';
    }
}

// 초대코드 복사 함수
async function copyInviteCode() {
  if (!actualInviteCode) {
    return;
  }
  
  const copyBtn = document.getElementById('copyInviteBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const copyIcon = document.getElementById('copyIcon');
  
  try {
    // 클립보드에 복사
    await navigator.clipboard.writeText(actualInviteCode);
    
    // 버튼 상태 변경 (성공)
    copyBtnText.textContent = '복사완료!';
    copyIcon.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    `;
    copyBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600', 'hover:to-blue-600');
    copyBtn.classList.add('bg-green-500', 'hover:bg-green-600');
    
    // 2초 후 원래 상태로 복구
    setTimeout(() => {
      copyBtnText.textContent = '복사';
      copyIcon.innerHTML = `
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
      `;
      copyBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
      copyBtn.classList.add('bg-blue-500', 'hover:bg-blue-600', 'hover:to-blue-600');
    }, 2000);
    
  } catch (err) {
    console.error('클립보드 복사 실패:', err);
    // 폴백: 텍스트 선택 방식
    fallbackCopyToClipboard(actualInviteCode);
  }
}

// 폴백 복사 함수
function fallbackCopyToClipboard(text) {
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (successful) {
      setTimeout(() => {
      }, 2000);
    }
  } catch (err) {
    console.error('폴백 복사도 실패:', err);
    alert('복사에 실패했습니다. 수동으로 복사해주세요: ' + text);
  }
}

// 코드 가시성 토글 함수
function toggleCodeVisibility() {
  const codeDisplay = document.getElementById('inviteCodeDisplay');
  const eyeIcon = document.getElementById('eyeIcon');
  
  if (!actualInviteCode) return; // 코드가 없으면 토글 안함
  
  if (isCodeVisible) {
    // 숨기기
    codeDisplay.textContent = '••••••';
    eyeIcon.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
    `;
    document.getElementById('toggleCodeBtn').title = '코드 보기';
  } else {
    // 보이기
    codeDisplay.textContent = actualInviteCode;
    eyeIcon.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L18 18"></path>
    `;
    document.getElementById('toggleCodeBtn').title = '코드 숨기기';
  }
  
  isCodeVisible = !isCodeVisible;
}

// 초대코드 설정 함수
function setInviteCode(code) {
  actualInviteCode = code;
  isCodeVisible = false; // 기본적으로 숨겨진 상태
  
  const codeDisplay = document.getElementById('inviteCodeDisplay');
  const toggleBtn = document.getElementById('toggleCodeBtn');
  const copyBtn = document.getElementById('copyInviteBtn');
  
  // 마스킹 표시
  codeDisplay.textContent = '••••••';
  
  // 버튼들 활성화
  toggleBtn.disabled = false;
  toggleBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  
  copyBtn.disabled = false;
  copyBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  
}

// 대기실 채팅 전송
function sendWaitingMessage() {
    const input = document.getElementById('waitingChatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // DOM에서 사용자 정보 추출
    const userProfile = getUserProfileFromDOM();
    
    // 서버에 전송 (사용자 정보 및 타임스탬프 포함)
    socket.emit('chatMessage', { 
        sessionId, 
        message,
        nickname: userProfile.nickname,
        profileImage: userProfile.profileImage,
        timestamp: Date.now() // 타임스탬프 추가
    });
    
    input.value = '';
}

function displayWaitingChat(user, profileImage, message, isMyMessage) {
    try {
        if (isMyMessage) {
            return;
        }

        const chatLog = document.getElementById('waitingChatLog');
        const profileImageUrl = profileImage;
        
        if (!chatLog) {
            console.error('⌧ waitingChatLog 요소를 찾을 수 없음');
            return;
        }
        
        // 마지막 메시지가 같은 사용자인지 확인
        const lastMessage = chatLog.lastElementChild;
        const isSameUser = lastMessage && 
                          lastMessage.getAttribute('data-user') === user;
        
        const messageElement = document.createElement('div');
        messageElement.setAttribute('data-user', user); // 사용자 정보 저장
        
        if (isSameUser) {
            // 연속 메시지: 프로필 없이 텍스트만 표시
            messageElement.className = 'flex items-start translate-y-[-3px] pl-[56px]'; // 프로필 이미지 크기만큼 왼쪽 패딩
            messageElement.innerHTML = `
                <div class="text-white text-sm break-words">
                    ${message}
                </div>
            `;
        } else {
            // 새로운 사용자 메시지: 프로필과 함께 표시
            messageElement.className = 'flex items-start mt-2';
            
            if (profileImageUrl && profileImageUrl !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png') {
                messageElement.innerHTML = `
                    <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                        <img src="${profileImageUrl}"
                        class="mt-1 w-8 h-8 mr-3 rounded-full object-cover border-2 border-white/20 flex-shrink-0"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                        >
                        <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20 flex-shrink-0" style="display: none;">
                            ${user.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-semibold text-sm text-white">${user}</div>
                            <div class="text-white text-sm break-words items-start">${message}</div>
                        </div>
                    </div>
                `;
            } else {
                messageElement.innerHTML = `
                    <div class="flex items-start rounded-lg px-3 max-w-[1000px]">
                        <div class="mt-1 w-8 h-8 mr-3 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20 flex-shrink-0">
                            ${user.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-semibold text-sm text-white mb-1">${user}</div>
                            <div class="text-white text-sm break-words">${message}</div>
                        </div>
                    </div>
                `;
            }
        }
        
        chatLog.appendChild(messageElement);
        chatLog.scrollTop = chatLog.scrollHeight;
        
    } catch (error) {
        console.error('displayWaitingChat 에러:', error);
        console.error('에러 스택:', error.stack);
    }
}

function getUserProfileFromDOM() {
    // 참가자 목록에서 현재 사용자 찾기
    const playerItems = document.querySelectorAll('#playerList li');
    
    for (let item of playerItems) {
        const myIndicator = item.querySelector('.text-blue-400'); // "나" 표시
        if (myIndicator && myIndicator.textContent.includes('나')) {
            // 프로필 이미지 추출
            const profileImg = item.querySelector('img');
            
            let profileImage = null;
            if (profileImg && profileImg.style.display !== 'none') {
                profileImage = profileImg.src;
            }

            const nameElement = item.querySelector('.font-medium');
            const displayName = nameElement ? nameElement.textContent.trim() : null;
            
            return {
                nickname: displayName || 'Unknown',
                profileImage: profileImage
            };
        }
    }
    
    return {
        nickname: 'Unknown',
        profileImage: null
    };
}

// 채팅창에 정답자 표시하는 함수
function displayCorrectUsersInChat(correctUsers) {
    const chatLog = document.getElementById('chatLog'); // chatBox → chatLog로 변경
    if (!chatLog) return;

    if (correctUsers && correctUsers.length > 0) {
        // 정답자가 있는 경우
        const correctUsersMessage = document.createElement('div');
        correctUsersMessage.className = 'mb-4 p-4 bg-blue-900/30 border-2 border-blue-400/50 rounded-xl';
        correctUsersMessage.innerHTML = `
            <div class="text-center">
                <h4 class="text-blue-400 font-bold mb-2">정답자 ${correctUsers.length}명</h4>
                <div class="flex flex-wrap justify-center gap-2">
                    ${correctUsers.map(user => `
                        <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-500/30 text-blue-200 border border-blue-400/50">
                            ${user}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
        chatLog.appendChild(correctUsersMessage);
        chatLog.scrollTop = chatLog.scrollHeight; // 스크롤 추가
    } else {
        // 정답자가 없는 경우
        const noCorrectMessage = document.createElement('div');
        noCorrectMessage.className = 'mb-4 p-4 bg-gray-800/50 border-2 border-gray-600 rounded-xl text-center';
        noCorrectMessage.innerHTML = `
            <p class="text-gray-400">아무도 정답을 맞히지 못했습니다</p>
        `;
        chatLog.appendChild(noCorrectMessage);
        chatLog.scrollTop = chatLog.scrollHeight; // 스크롤 추가
    }
}

// 객관식 문제 키보드 선택 핸들러
function handleChoiceKeyPress(e) {
    // 입력 필드에 포커스가 있으면 무시
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA') {
        return;
    }
    
    // 1-9 숫자 키 처리
    const key = e.key;
    if (key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        const buttons = document.querySelectorAll('.choice-btn');
        
        if (buttons[index] && !buttons[index].disabled) {
            // 해당 버튼 클릭
            buttons[index].click();
            
            // 시각적 피드백 (약간의 애니메이션)
            buttons[index].classList.add('scale-95');
            setTimeout(() => {
                buttons[index].classList.remove('scale-95');
            }, 100);
        }
    }
}

// 유튜브 비디오 ID 추출
function extractYoutubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

function showAnswerWithYoutube({ answers, answerImageBase64, revealedAt, index }) {
    const box = document.getElementById('questionBox');
    
    if (questionTimer) clearTimeout(questionTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    const displayAnswer = Array.isArray(answers) ? answers[0] : answers;

    let html = `
        <div class="bg-green-500/20 border-green-400 rounded-xl p-6 mb-4">
            <h3 class="font-bold text-green-400 mb-2">정답</h3>
            <div class="text-white">
                ${displayAnswer}
            </div>
        </div>
    `;

    // 정답 이미지
    if (answerImageBase64) {
        html += `
            <div class="mb-4">
                <h4 class="text-lg font-semibold text-gray-300 mb-2">정답 이미지</h4>
                <img src="${answerImageBase64}" 
                     alt="정답 이미지" 
                     class="w-auto h-auto max-h-[300px] mx-auto rounded-lg shadow-lg">
            </div>
        `;
    }

    // 정답 유튜브 영상
    const question = questions[index];
    if (question && question.answerYoutubeUrl) {
        const videoId = extractYoutubeVideoId(question.answerYoutubeUrl);
        const startTime = question.answerYoutubeStartTime || 0;
        
        if (videoId) {
            html += `
                <div class="mb-4">
                    <div class="youtube-player-wrapper max-w-2xl mx-auto">
                        <div class="relative" style="padding-bottom: 56.25%; height: 0;">
                            <!-- YouTube 플레이어가 여기에 생성됨 -->
                            <div id="youtubePlayerAnswer" class="absolute top-0 left-0 w-full h-full rounded-lg"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    box.innerHTML = html;

    // 정답 유튜브 영상이 있으면 플레이어 생성
    if (question && question.answerYoutubeUrl) {
        const videoId = extractYoutubeVideoId(question.answerYoutubeUrl);
        const startTime = question.answerYoutubeStartTime || 0;
        
        if (videoId) {
            setTimeout(() => {
                createYoutubePlayer(videoId, startTime, 0, 'youtubePlayerAnswer');
            }, 100);
        }
    }

    window.__isRevealingAnswer = true;

    const elapsed = (Date.now() - new Date(revealedAt).getTime()) / 1000;
    const waitTime = Math.max(0, 5 - elapsed);

    setTimeout(() => {
        window.__isRevealingAnswer = false;
        if (isHost()) {
            socket.emit('nextQuestion', { sessionId, userId });
        }
    }, waitTime * 1000);
}

function startCountdown(timeLimit) {
    if (questionTimer) clearTimeout(questionTimer);
    if (countdownInterval) clearInterval(countdownInterval);

    const elapsed = (Date.now() - questionStartAt.getTime()) / 1000;
    let remaining = Math.max(0, Math.floor(timeLimit - elapsed));

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = `남은 시간: ${remaining}초`;
    }

    countdownInterval = setInterval(() => {
        remaining--;
        if (timerDisplay) {
            timerDisplay.textContent = `남은 시간: ${remaining}초`;
        }
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    questionTimer = setTimeout(() => {
        if (isHost()) {
            socket.emit('revealAnswer', { sessionId });
        }
    }, remaining * 1000);
}

// YouTube API 준비 완료 콜백
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube IFrame API 준비 완료');
};

// 유튜브 플레이어 생성 함수
function createYoutubePlayer(videoId, startTime, endTime, elementId) {
    // 기존 플레이어 제거
    if (youtubePlayer) {
        youtubePlayer.destroy();
        youtubePlayer = null;
    }
    
    // 새 플레이어 생성
    youtubePlayer = new YT.Player(elementId, {
        videoId: videoId,
        playerVars: {
            autoplay: 0,  // ← 자동 재생 끄기
            start: startTime,
            end: endTime > 0 ? endTime : undefined,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3
        },
        events: {
            onReady: function(event) {
                // 볼륨 먼저 설정
                event.target.setVolume(globalYoutubeVolume);
                // 그 다음 재생
                event.target.playVideo();
            },
            onStateChange: function(event) {
                if (event.data === YT.PlayerState.ENDED) {
                    event.target.seekTo(startTime);
                    event.target.playVideo();
                }
            }
        }
    });
}

// 볼륨 설정 함수 (실시간 적용)
function setYoutubeVolume(volume) {
    globalYoutubeVolume = parseInt(volume);
    
    // 화면 표시 업데이트
    const volumePercent = document.getElementById('volumePercent');
    if (volumePercent) {
        volumePercent.textContent = `${globalYoutubeVolume}%`;
    }
    
    // YouTube 플레이어에 즉시 적용
    if (youtubePlayer && youtubePlayer.setVolume) {
        youtubePlayer.setVolume(globalYoutubeVolume);
    }
    
    // localStorage에 저장
    localStorage.setItem('youtubeVolume', globalYoutubeVolume);
}

// 저장된 볼륨 불러오기
function loadSavedVolume() {
    const savedVolume = localStorage.getItem('youtubeVolume');
    if (savedVolume !== null) {
        globalYoutubeVolume = parseInt(savedVolume);
    }
}

// 초기화
loadSavedVolume();


// 전역 함수로 등록 (HTML onclick에서 사용)
window.toggleCodeVisibility = toggleCodeVisibility;
window.copyInviteCode = copyInviteCode;
window.selectChoice = selectChoice;
window.currentSendFunction = () => currentSendFunction();
window.currentWaitingSendFunction = () => currentWaitingSendFunction();
window.handleChoiceKeyPress = handleChoiceKeyPress;
window.extractYoutubeVideoId = extractYoutubeVideoId;
window.setYoutubeVolume = setYoutubeVolume;
window.createYoutubePlayer = createYoutubePlayer;

// 페이지 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);