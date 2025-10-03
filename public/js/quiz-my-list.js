// quiz-my-list.js
import { renderNavbar, highlightCurrentPage } from './navbar.js';

let currentEditQuizId = null;

// 토큰 인증이 포함된 fetch 함수
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
            alert('세션이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = '/login';
            return;
        }
    }
    return response;
}

// 페이지 초기화
async function initializePage() {
    try {
        // 상단바 렌더링
        const user = await renderNavbar();
        highlightCurrentPage();
        
        // 로그인 체크
        if (!user) {
            window.location.href = '/login?message=' + encodeURIComponent('로그인이 필요합니다.');
            return;
        }
        
        // 퀴즈 목록 로드
        await loadQuizList();
        
    } catch (error) {
        console.error('페이지 초기화 실패:', error);
        showError();
    }
}

// 퀴즈 목록 로드
async function loadQuizList() {
    try {
        const response = await fetchWithAuth('/api/quiz/my-list');
        const quizzes = await response.json();
        
        // 로딩 숨기기
        document.getElementById('loadingSection').classList.add('hidden');
        
        if (quizzes.length === 0) {
            // 빈 상태 표시
            document.getElementById('emptySection').classList.remove('hidden');
        } else {
            // 퀴즈 목록 표시
            document.getElementById('quizListSection').classList.remove('hidden');
            renderQuizList(quizzes);
        }
        
    } catch (error) {
        console.error('퀴즈 목록 로드 실패:', error);
        showError();
    }
}

// 퀴즈 목록 렌더링
function renderQuizList(quizzes) {
    const quizList = document.getElementById('quizList');
    quizList.innerHTML = '';
    
    quizzes.forEach(quiz => {
        const card = createQuizCard(quiz);
        quizList.appendChild(card);
    });
}

// 퀴즈 카드 생성
function createQuizCard(quiz) {
    const card = document.createElement('div');
    card.className = 'quiz-card bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer';
    
    const statusBadge = quiz.isComplete 
        ? '<span class="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded">완료</span>'
        : '<span class="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2.5 py-0.5 rounded">작성중</span>';
    
    const thumbnailHTML = quiz.titleImageBase64 
        ? `<img src="${quiz.titleImageBase64}" alt="${quiz.title}" class="w-full h-48 object-cover">`
        : `<div class="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
             <span class="text-6xl font-bold text-white opacity-50">Q</span>
           </div>`;
    
    card.innerHTML = `
        ${thumbnailHTML}
        
        <div class="p-6">
            <!-- 제목과 상태 -->
            <div class="flex items-start justify-between mb-3">
                <h3 class="text-xl font-bold text-gray-900 line-clamp-2 flex-1">${quiz.title}</h3>
                ${statusBadge}
            </div>
            
            <!-- 설명 -->
            <p class="text-gray-600 text-sm mb-4 line-clamp-2 min-h-[40px]">
                ${quiz.description || '설명이 없습니다.'}
            </p>
            
            <!-- 메타 정보 -->
            <div class="flex items-center justify-between text-sm text-gray-500 mb-4 pb-4 ">
                <div class="flex items-center space-x-4">
                    <span>${quiz.questions.length}문제</span>
                    <span>${quiz.completedGameCount || 0}회 플레이</span>
                </div>
            </div>
            
            <!-- 액션 버튼들 -->
            <div class="flex gap-2">
                <button 
                    onclick="event.stopPropagation(); openGameSession('${quiz._id}')" 
                    class="flex-1 bg-blue-400 hover:to-blue-500 text-white font-medium py-2.5 rounded-lg transition-all transform hover:scale-105"
                >
                    게임 생성
                </button>
                <button 
                    onclick="event.stopPropagation(); window.location.href='/quiz/edit?quizId=${quiz._id}'" 
                    class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                    문제 편집
                </button>
            </div>
            
            <div class="flex gap-2 mt-2">
                <button 
                    onclick="event.stopPropagation(); openEditModal('${quiz._id}', '${escapeHtml(quiz.title)}', '${escapeHtml(quiz.description || '')}')" 
                    class="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-medium py-2 rounded-lg transition-colors text-sm"
                >
                    제목 수정
                </button>
                <button 
                    onclick="event.stopPropagation(); deleteQuiz('${quiz._id}')" 
                    class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 rounded-lg transition-colors text-sm"
                >
                    삭제
                </button>
            </div>
        </div>
    `;
    
    return card;
}

// HTML 이스케이프 함수
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 게임 세션 시작
async function openGameSession(quizId) {
    try {
        const response = await fetchWithAuth('/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quizId }),
        });
        
        const data = await response.json();
        
        if (data.sessionId) {
            window.location.href = `/quiz/${data.sessionId}`;
        } else {
            alert('게임 세션 생성에 실패했습니다.');
        }
    } catch (error) {
        console.error('게임 세션 생성 실패:', error);
        alert('게임을 시작하는 중 오류가 발생했습니다.');
    }
}

// 수정 모달 열기
function openEditModal(quizId, title, description) {
    currentEditQuizId = quizId;
    document.getElementById('editTitle').value = title;
    document.getElementById('editDescription').value = description;
    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('flex');
}

// 수정 모달 닫기
function closeEditModal() {
    currentEditQuizId = null;
    document.getElementById('editModal').classList.add('hidden');
    document.getElementById('editModal').classList.remove('flex');
}

// 수정 저장
async function saveEdit() {
    const title = document.getElementById('editTitle').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    
    if (!title) {
        alert('제목은 필수입니다.');
        return;
    }
    
    try {
        const response = await fetchWithAuth(`/api/quiz/${currentEditQuizId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('수정되었습니다.');
            closeEditModal();
            location.reload();
        } else {
            alert(result.message || '수정에 실패했습니다.');
        }
    } catch (error) {
        console.error('수정 실패:', error);
        alert('수정 중 오류가 발생했습니다.');
    }
}

// 퀴즈 삭제
async function deleteQuiz(quizId) {
    if (!confirm('이 퀴즈를 정말 삭제하시겠습니까?\n삭제된 퀴즈는 복구할 수 없습니다.')) {
        return;
    }
    
    try {
        const response = await fetchWithAuth(`/api/quiz/${quizId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('퀴즈가 삭제되었습니다.');
            location.reload();
        } else {
            alert(result.message || '삭제에 실패했습니다.');
        }
    } catch (error) {
        console.error('삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

// 에러 표시
function showError() {
    document.getElementById('loadingSection').classList.add('hidden');
    document.getElementById('emptySection').classList.add('hidden');
    document.getElementById('quizListSection').classList.add('hidden');
    document.getElementById('errorSection').classList.remove('hidden');
}

// 전역 함수로 등록
window.openGameSession = openGameSession;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteQuiz = deleteQuiz;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);