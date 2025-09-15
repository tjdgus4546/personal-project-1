// js/main.js

import { renderNavbar, getUserData, highlightCurrentPage } from './navbar.js';

let allQuizzes = [];
let currentPage = 1;
let currentSearchTerm = '';
let currentSortOrder = 'popular';
let isLoading = false;
let hasMore = true;

// 초대 코드로 게임 참여
async function joinByInvite() {
    console.log('joinByInvite 함수 호출됨');
    
    const code = document.getElementById('inviteInput').value.trim();
    console.log('입력된 초대코드:', code);
    
    if (!code) {
        alert('초대 코드를 입력하세요');
        return;
    }

    try {
        console.log('API 요청 시작');
        const response = await fetch('/game/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: JSON.stringify({ inviteCode: code }),
            credentials: 'include'
        });

        console.log('API 응답 상태:', response.status);
        const result = await response.json();
        console.log('API 응답 데이터:', result);

        if (response.ok) {
            console.log('게임 참여 성공, 이동:', `/quiz/${result.sessionId}`);
            window.location.href = `/quiz/${result.sessionId}`;
        } else {
            console.error('게임 참여 실패:', result.message);
            alert(result.message || '입장에 실패했습니다. 코드를 다시 확인해주세요.');
        }
    } catch (err) {
        console.error('Join session error:', err);
        alert('입장 중 오류가 발생했습니다.');
    }
}

async function changeSortOrder(newSortOrder) {
    console.log('정렬 순서 변경:', newSortOrder);
    currentSortOrder = newSortOrder;  // 🔄 정렬 상태 업데이트
    currentPage = 1;                  // 📄 페이지를 1로 리셋
    hasMore = true;                   // ➡️ 더보기 상태 리셋
    allQuizzes = [];                  // 🗑️ 기존 데이터 초기화
    
    // 🔄 로딩 메시지 표시
    const quizListContainer = document.getElementById('quizList');
    quizListContainer.innerHTML = `
        <div class="text-center py-8 col-span-full">
            <div class="inline-flex items-center space-x-2 text-gray-300">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <span>퀴즈 목록을 정렬하는 중...</span>
            </div>
        </div>
    `;
    
    await loadQuizzes(); // 🔄 새로운 정렬로 데이터 로드
}

// 검색 이벤트 리스너 설정
function setupSearchListener() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    // 버튼 클릭으로 검색
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            searchQuizzes(searchInput.value);
        });
    }
    
    // Enter 키로도 검색
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchQuizzes(searchInput.value);
            }
        });
    }
}

// 검색 실행 함수
async function searchQuizzes(searchTerm) {
    currentSearchTerm = searchTerm;
    currentPage = 1;
    hasMore = true;
    allQuizzes = []; // 기존 데이터 초기화
    
    const quizListContainer = document.getElementById('quizList');
    quizListContainer.innerHTML = `<div class="loading-spinner text-center py-8 col-span-full text-gray-300">검색 중...</div>`;
    
    await loadQuizzes();
}

// 통합된 퀴즈 로딩 함수
async function loadQuizzes() {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    
    try {
        let url;
        if (currentSearchTerm) {
            // 검색 모드
            url = `/api/quiz/search?q=${encodeURIComponent(currentSearchTerm)}&page=${currentPage}&limit=20&sort=${currentSortOrder}`;
        } else {
            // 일반 목록 모드
            url = `/api/quiz/list?page=${currentPage}&limit=20&sort=${currentSortOrder}`;
        }
        
        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json();
        
        if (response.ok) {
            // 첫 번째 페이지면 기존 데이터 초기화, 아니면 추가
            if (currentPage === 1) {
                allQuizzes = data.quizzes || [];
            } else {
                allQuizzes = [...allQuizzes, ...(data.quizzes || [])];
            }
            
            hasMore = data.hasMore || false;
            renderQuizList(allQuizzes);
            
            // 무한 스크롤 설정 (첫 로딩시에만)
            if (currentPage === 1) {
                setupInfiniteScroll();
            }
        } else {
            throw new Error('퀴즈 목록을 불러오지 못했습니다.');
        }
    } catch (err) {
        console.error('퀴즈 로딩 실패:', err);
        const quizListContainer = document.getElementById('quizList');
        quizListContainer.innerHTML = `
            <div class="text-center py-8 col-span-full">
                <p class="text-gray-500">퀴즈 목록을 불러올 수 없습니다.</p>
                <button onclick="loadQuizList()" class="mt-2 text-blue-400 hover:text-blue-300">
                    다시 시도
                </button>
            </div>
        `;
    } finally {
        isLoading = false;
    }
}

// 다음 페이지 로딩
async function loadMoreQuizzes() {
    if (isLoading || !hasMore) return;
    
    currentPage++;
    await loadQuizzes();
}

// 무한 스크롤 설정
function setupInfiniteScroll() {
    // 기존 리스너 제거
    window.removeEventListener('scroll', handleScroll);
    
    // 새 리스너 추가
    window.addEventListener('scroll', handleScroll);
}

// 스크롤 핸들러
function handleScroll() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
        loadMoreQuizzes();
    }
}

// 퀴즈 목록 초기 로딩
async function loadQuizList() {
    const quizListContainer = document.getElementById('quizList');
    if (!quizListContainer) {
        console.error('quizList 컨테이너를 찾을 수 없습니다');
        return;
    }

    // 로딩 상태 표시
    quizListContainer.innerHTML = `
        <div class="text-center py-8 col-span-full">
            <div class="inline-flex items-center space-x-2 text-gray-300">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <span>퀴즈 목록을 불러오는 중...</span>
            </div>
        </div>
    `;

    // 상태 초기화
    currentPage = 1;
    currentSearchTerm = '';
    currentSortOrder = 'popular';
    hasMore = true;
    allQuizzes = [];

    // 정렬 드롭다운 초기값 설정
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = currentSortOrder;
    }

    try {
        await loadQuizzes();
        setupSearchListener();
    } catch (err) {
        console.error('퀴즈 목록 불러오기 실패:', err);
        quizListContainer.innerHTML = `
            <div class="text-center py-8 col-span-full">
                <p class="text-gray-500">퀴즈 목록을 불러올 수 없습니다.</p>
                <button onclick="loadQuizList()" class="mt-2 text-blue-400 hover:text-blue-300">
                    다시 시도
                </button>
            </div>
        `;
    }
}

// 퀴즈 목록 렌더링
function renderQuizList(quizzes) {
    const quizListContainer = document.getElementById('quizList');
    if (!quizListContainer) return;

    if (quizzes.length === 0) {
        quizListContainer.innerHTML = `
            <div class="text-center py-8 col-span-full">
                <p class="text-gray-500">등록된 퀴즈가 없습니다.</p>
            </div>
        `;
        return;
    }

    const quizHTML = quizzes.map(quiz => `
        <div class="quiz-card bg-white rounded-lg shadow-md overflow-hidden cursor-pointer" onclick="playQuiz('${quiz._id}')">
            <div class="relative">
                ${quiz.titleImageBase64 ? 
                    `<img src="${quiz.titleImageBase64}" alt="${quiz.title}" class="w-full h-48 object-cover">` :
                    `<div class="w-full h-48 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center">
                        <span class="text-white text-4xl font-bold">Q</span>
                    </div>`
                }
            </div>
            <div class="p-5">
                <div class="font-bold text-[15px] mb-2 text-gray-800 truncate text-left" title="${quiz.title}">${quiz.title}</div>
                <p class="text-gray-600 text-[15px] mb-4 line-clamp-2 min-h-[2.5rem] text-left">${quiz.description || '퀴즈에 도전해보세요!'}</p>
                <div class="flex justify-between items-center text-xs text-gray-500">
                    <div class="flex items-center space-x-1">
                        <span>플레이:</span>
                        <span>${quiz.completedGameCount || 0}회</span>
                    </div>
                    <span>생성일: ${new Date(quiz.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
            </div>
        </div>
    `).join('');

    // 로딩 중 메시지 추가 (더 로드할 데이터가 있고 현재 로딩 중일 때)
    const loadingMessage = hasMore && isLoading ? `
        <div class="text-center py-4 col-span-full">
            <div class="inline-flex items-center space-x-2 text-gray-500">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                <span>더 많은 퀴즈를 불러오는 중...</span>
            </div>
        </div>
    ` : '';

    quizListContainer.innerHTML = quizHTML + loadingMessage;
}

// 퀴즈 플레이 시작
function playQuiz(quizId) {
    window.location.href = `/quiz/play?id=${quizId}`;
}

// 페이지 UI 업데이트
function updatePageUI(user) {
    const inviteSection = document.getElementById('inviteSection');
    loadQuizList();

    if (user) {
        // 로그인 상태
        inviteSection.classList.remove('hidden');
    } else { 
        // 비로그인 상태
        inviteSection.classList.add('hidden');
    }
}

// 이벤트 리스너 설정
function attachEventListeners() {
    const joinBtn = document.getElementById('joinBtn');
    const inviteInput = document.getElementById('inviteInput');

    if (joinBtn) {
        joinBtn.addEventListener('click', joinByInvite);
    }

    // Enter 키로도 참여 가능
    if (inviteInput) {
        inviteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinByInvite();
            }
        });
    }
}

// 페이지 초기화
async function initializePage() {
    try {
        // 1. 상단바 렌더링 (사용자 정보도 함께 반환)
        const user = await renderNavbar();
        
        // 2. 현재 페이지 하이라이트
        highlightCurrentPage();
        
        // 3. 페이지 UI 업데이트
        updatePageUI(user);
        
        // 4. 이벤트 리스너 설정
        attachEventListeners();
                
    } catch (err) {
        console.error('페이지 초기화 실패:', err);
        // 에러가 발생해도 기본 UI는 표시
        updatePageUI(null);
        attachEventListeners();
    }
}

// 전역 함수로 등록 (HTML onclick에서 사용)
window.playQuiz = playQuiz;
window.loadQuizList = loadQuizList;
window.joinByInvite = joinByInvite;
window.changeSortOrder = changeSortOrder;

// 페이지 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);