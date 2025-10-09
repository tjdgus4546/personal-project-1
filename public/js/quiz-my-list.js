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
    card.className = 'bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-2xl cursor-pointer';
    card.onclick = () => window.location.href = `/quiz/edit?quizId=${quiz._id}`;
    
    // 문제 수가 10개 미만인지 확인
    const isLessThan10 = quiz.questions.length < 10;
    const isComplete = quiz.isComplete || false;
    
    card.innerHTML = `
        <div class="relative h-48 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500">
            <img src="${quiz.titleImageBase64}" alt="${quiz.title}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            
            ${isComplete ? `
                <div class="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                        <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
                    </svg>
                    공개
                </div>
            ` : `
                <div class="absolute top-4 right-4 bg-gray-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
                        <path d="M12.454 16.697l-.664-.664a9.967 9.967 0 01-3.675.787c-4.478 0-8.268-2.943-9.542-7a9.974 9.974 0 011.675-3.597l-.664-.664a10.967 10.967 0 00-1.977 4.261 1 1 0 000 .001c1.274 4.057 5.064 7 9.542 7 1.794 0 3.5-.46 4.977-1.277z"/>
                    </svg>
                    비공개
                </div>
            `}
            
            <div class="absolute bottom-4 left-4 right-4">
                <h3 class="text-xl font-bold text-white mb-1 line-clamp-2">${quiz.title}</h3>
            </div>
        </div>
        
        <div class="p-6">
            <p class="text-gray-600 mb-4 line-clamp-2 min-h-[48px]">
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
                    onclick="event.stopPropagation(); toggleQuizPublic('${quiz._id}', ${isComplete}, ${quiz.questions.length})" 
                    class="flex-1 bg-blue-400 hover:to-blue-500 text-white font-medium py-2.5 rounded-lg transition-all transform hover:scale-105"
                >
                    ${isComplete ? '비공개' : '퀴즈 공개'}
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
                    class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                    제목 수정
                </button>
                <button 
                    onclick="event.stopPropagation(); deleteQuiz('${quiz._id}')" 
                    class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-lg transition-colors"
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

async function toggleQuizPublic(quizId, currentIsComplete, questionCount) {
    // 공개 시도 시 10문제 미만이면 경고
    if (!currentIsComplete && questionCount < 10) {
        alert('퀴즈는 10문제 이상 공개 상태로 전환 가능합니다.');
        return;
    }
    
    const newStatus = !currentIsComplete;
    const statusText = newStatus ? '공개' : '비공개';
    
    if (!confirm(`이 퀴즈를 ${statusText}로 전환하시겠습니까?`)) {
        return;
    }
    
    try {
        // 공개 또는 비공개 API 호출
        const endpoint = newStatus 
            ? `/api/quiz/${quizId}/complete`     // 공개
            : `/api/quiz/${quizId}/incomplete`;   // 비공개
        
        const method = newStatus ? 'POST' : 'PUT';
        
        const response = await fetchWithAuth(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(`퀴즈가 ${statusText}로 전환되었습니다.`);
            location.reload();
        } else {
            alert(result.message || '상태 변경에 실패했습니다.');
        }
    } catch (error) {
        console.error('공개 상태 변경 실패:', error);
        alert('상태 변경 중 오류가 발생했습니다.');
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
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.deleteQuiz = deleteQuiz;
window.toggleQuizPublic = toggleQuizPublic;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);