// quiz-edit.js
import { renderNavbar, highlightCurrentPage } from './navbar.js';
import { resizeImageToBase64 } from './quiz-init-modal.js';
import { fetchWithAuth } from './quiz-init-modal.js'; 

// 전역 변수
let currentView = 'overview';
let questions = [];
let currentEditingIndex = null;
let currentAnswers = [];
let currentIncorrects = [];
let currentQuestionType = 'text'; // 'text', 'image', 'video', 'audio'
let questionImageBase64 = '';
let answerImageBase64 = '';
const quizId = new URLSearchParams(window.location.search).get('quizId');

// 문제 타입 자동 감지 (기존 문제용)
function detectQuestionType(question) {
    if (question.questionType) {
        return question.questionType;
    }
    
    if (question.imageBase64) {
        return 'image';
    } else if (question.youtubeUrl) {
        // 기존 로직에서는 구분이 없으므로 기본값으로 'video'
        return 'video';
    } else {
        return 'text';
    }
}

// 네비바 렌더링
async function initNavbar() {
    const user = await renderNavbar();
    highlightCurrentPage();
    
    if (!user) {
        window.location.href = '/login?message=' + encodeURIComponent('로그인이 필요합니다.');
        return false;
    }
    return true;
}

// 문제 타입 선택 함수 (버튼 클릭 시 호출)
export function selectQuestionType(type) {
    currentQuestionType = type; // 전역 변수 업데이트
    
    // 모든 버튼의 스타일 초기화
    document.querySelectorAll('[data-question-type]').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-400');
        btn.classList.add('bg-gray-700', 'hover:bg-gray-600');
    });
    
    // 선택된 버튼 활성화 스타일 적용
    const selectedButton = document.querySelector(`[data-question-type="${type}"]`);
    if (selectedButton) {
        selectedButton.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        selectedButton.classList.add('bg-blue-600', 'ring-2', 'ring-blue-400');
    }
    
    // 타입에 따른 폼 표시/숨김
    updateFormVisibility();
}

// 폼 표시 업데이트 함수
function updateFormVisibility() {
    const isMultipleChoice = document.getElementById('isMultipleChoice')?.checked || false;
    
    // 모든 섹션 요소 가져오기
    const sections = {
        questionText: document.getElementById('questionTextSection'),
        questionImage: document.getElementById('questionImageSection'),
        youtube: document.getElementById('youtubeSection'),
        answerText: document.getElementById('answerTextSection'),
        answerImage: document.getElementById('answerImageSection'),
        answerYoutube: document.getElementById('answerYoutubeSection'),
        incorrect: document.getElementById('incorrectSection'),
    };
    
    // 디버깅: 어떤 섹션이 없는지 확인
    Object.entries(sections).forEach(([key, element]) => {
        if (!element) {
            console.warn(`${key} 섹션을 찾을 수 없습니다`);
        }
    });
    
    // 모든 섹션 숨김 (초기화)
    Object.values(sections).forEach(section => {
        if (section) section.style.display = 'none';
    });
    
    
    // 문제 타입별로 표시할 섹션 결정
    switch(currentQuestionType) {
        case 'text':
            // 텍스트 문제: 문제 텍스트, 정답 텍스트만
            if (sections.questionText) sections.questionText.style.display = 'block';
            if (sections.answerText) sections.answerText.style.display = 'block';
            break;
            
        case 'image':
            // 이미지 문제: 문제 텍스트 + 문제 이미지 + 정답 텍스트 + 정답 이미지
            if (sections.questionText) sections.questionText.style.display = 'block';
            if (sections.questionImage) sections.questionImage.style.display = 'block';
            if (sections.answerText) sections.answerText.style.display = 'block';
            if (sections.answerImage) sections.answerImage.style.display = 'block';

            break;
            
        case 'video':
            // 영상 문제: 문제 텍스트 + 유튜브 편집 + 정답 텍스트 + 정답 유튜브
            if (sections.questionText) sections.questionText.style.display = 'block';
            if (sections.youtube) sections.youtube.style.display = 'block';
            if (sections.answerText) sections.answerText.style.display = 'block';
            if (sections.answerYoutube) sections.answerYoutube.style.display = 'block';
            
            const youtubeTitle = document.getElementById('youtubeSectionTitle');
            if (youtubeTitle) youtubeTitle.textContent = '유튜브 영상 문제 편집';
            
            break;
            
        case 'audio':
            // 소리 문제: 영상 문제와 동일 (CSS로 숨김 처리는 게임 세션에서)
            if (sections.questionText) sections.questionText.style.display = 'block';
            if (sections.youtube) sections.youtube.style.display = 'block';
            if (sections.answerText) sections.answerText.style.display = 'block';
            if (sections.answerYoutube) sections.answerYoutube.style.display = 'block';
            
            const audioTitle = document.getElementById('youtubeSectionTitle');
            if (audioTitle) audioTitle.textContent = '유튜브 소리 문제 편집 (영상은 게임에서 가려짐)';
            
            break;
            
        default:
            console.warn('알 수 없는 문제 타입:', currentQuestionType);
    }
    
    // 객관식 섹션은 타입과 관계없이 처리
    if (sections.incorrect) {
        sections.incorrect.style.display = isMultipleChoice ? 'block' : 'none';
    }
}

// 객관식 토글
export function toggleMultipleChoice() {
    const isChecked = document.getElementById('isMultipleChoice').checked;
    const incorrectSection = document.getElementById('incorrectSection');
    
    if (isChecked) {
        incorrectSection.classList.remove('hidden');
    } else {
        incorrectSection.classList.add('hidden');
    }
    
    // 문제 타입에 따라 추가 업데이트
    updateFormVisibility();
}

// 뷰 전환
export function switchView(view) {
    currentView = view;
    
    const overviewBtn = document.getElementById('overviewBtn');
    const editBtn = document.getElementById('editBtn');
    
    if (view === 'overview') {
        overviewBtn.className = 'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-blue-500 text-white';
        editBtn.className = 'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-300 hover:text-white';
        
        document.getElementById('overviewView').classList.remove('hidden');
        document.getElementById('editView').classList.add('hidden');
    } else {
        overviewBtn.className = 'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 text-gray-300 hover:text-white';
        editBtn.className = 'px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 bg-blue-500 text-white';
        
        document.getElementById('overviewView').classList.add('hidden');
        document.getElementById('editView').classList.remove('hidden');
        renderSidebar();
    }
}

// 이미지 미리보기
export async function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    const img = preview.querySelector('img');
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // 파일 크기 체크 (6MB)
        const maxSizeInBytes = 6 * 1024 * 1024;
        if (file.size > maxSizeInBytes) {
            alert('파일 크기가 너무 큽니다! (최대 6MB)');
            input.value = '';
            return;
        }
        
        try {
            // resizeImageToBase64 사용하여 이미지 압축
            const resizedBase64 = await resizeImageToBase64(file, 240, 40);
            
            img.src = resizedBase64;
            preview.classList.remove('hidden');
            
            if (previewId === 'questionImagePreview') {
                questionImageBase64 = resizedBase64;
            } else if (previewId === 'answerImagePreview') {
                answerImageBase64 = resizedBase64;
            }
            
            const sizeKB = Math.round((resizedBase64.length * 3) / 4 / 1024);
            console.log(`✔ 이미지 압축 완료: ${sizeKB}KB`);
            
        } catch (error) {
            alert('이미지 처리 실패: ' + error.message);
            input.value = '';
        }
    }
}

// 이미지 제거
export function removeImage(inputId, previewId) {
    document.getElementById(inputId).value = '';
    const preview = document.getElementById(previewId);
    preview.classList.add('hidden');
    preview.querySelector('img').src = '';
    
    // Base64 초기화
    if (previewId === 'questionImagePreview') {
        questionImageBase64 = '';
    } else if (previewId === 'answerImagePreview') {
        answerImageBase64 = '';
    }
}

// 유튜브 미리보기 업데이트
export function updateYoutubePreview() {
    const url = document.getElementById('youtubeUrl').value.trim();
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    // 정답 유튜브 URL에도 자동 복사
    const answerYoutubeUrlInput = document.getElementById('answerYoutubeUrl');
    if (url && answerYoutubeUrlInput) {
        answerYoutubeUrlInput.value = url;
        updateAnswerYoutubePreview(); // 정답 미리보기도 업데이트
    }

    if (!url) {
        document.getElementById('youtubePreview').classList.add('hidden');
        return;
    }

    const videoId = extractYoutubeVideoId(url);
    if (videoId) {
        const iframe = document.getElementById('youtubeIframe');
        let embedUrl = `https://www.youtube.com/embed/${videoId}?`;

        if (startTime) {
            const startSeconds = parseTimeToSeconds(startTime);
            embedUrl += `start=${startSeconds}&`;
        } else {
            // 시작 시간이 없으면 0초부터
            embedUrl += `start=0&`;
        }

        if (endTime) {
            const endSeconds = parseTimeToSeconds(endTime);
            embedUrl += `end=${endSeconds}&`;
        }

        iframe.src = embedUrl;
        document.getElementById('youtubePreview').classList.remove('hidden');
    }
}

// 정답 유튜브 미리보기 업데이트
export function updateAnswerYoutubePreview() {
    const url = document.getElementById('answerYoutubeUrl').value.trim();
    const startTime = document.getElementById('answerStartTime').value;
    
    if (!url) {
        document.getElementById('answerYoutubePreview').classList.add('hidden');
        return;
    }
    
    const videoId = extractYoutubeVideoId(url);
    if (videoId) {
        const iframe = document.getElementById('answerYoutubeIframe');
        let embedUrl = `https://www.youtube.com/embed/${videoId}?`;
        
        if (startTime) {
            const startSeconds = parseTimeToSeconds(startTime);
            embedUrl += `start=${startSeconds}&`;
        }
        
        iframe.src = embedUrl;
        document.getElementById('answerYoutubePreview').classList.remove('hidden');
    }
}

// 유튜브 비디오 ID 추출
function extractYoutubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
}

// 시간을 초로 변환
function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 1) return parts[0]; // 초만
    if (parts.length === 2) return parts[0] * 60 + parts[1]; // 분:초
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // 시:분:초
    
    return 0;
}

// 초를 시간 형식으로 변환
function secondsToTimeFormat(seconds) {
    if (!seconds || seconds === 0) return '';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else if (minutes > 0) {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${secs}`;
    }
}

// 정답 추가
export function addAnswer() {
    const input = document.getElementById('answerInput');
    const answer = input.value.trim();
    
    if (!answer) {
        alert('정답을 입력하세요.');
        return;
    }

    if (currentAnswers.length >= 20) {
        alert('정답은 최대 20개까지 추가할 수 있습니다.');
        return;
    }
    
    if (currentAnswers.includes(answer)) {
        alert('이미 추가된 정답입니다.');
        return;
    }
    
    currentAnswers.push(answer);
    input.value = '';
    renderAnswers();
}

// 정답 렌더링
function renderAnswers() {
    const container = document.getElementById('answersList');
    container.innerHTML = '';
    
    currentAnswers.forEach((answer, index) => {
        const tag = document.createElement('div');
        tag.className = 'bg-green-500/20 border border-green-500 text-green-300 px-4 py-2 rounded-lg flex items-center space-x-2';
        tag.innerHTML = `
            <span>${answer}</span>
            <button onclick="window.removeAnswer(${index})" class="text-green-300 hover:text-green-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;
        container.appendChild(tag);
    });
}

// 정답 제거
export function removeAnswer(index) {
    currentAnswers.splice(index, 1);
    renderAnswers();
}

// 오답 추가
export function addIncorrect() {
    const input = document.getElementById('incorrectInput');
    const incorrect = input.value.trim();
    
    if (!incorrect) {
        alert('오답을 입력하세요.');
        return;
    }
    
    if (currentIncorrects.includes(incorrect)) {
        alert('이미 추가된 오답입니다.');
        return;
    }
    
    if (currentIncorrects.length >= 4) {
        alert('오답은 최대 4개까지만 추가할 수 있습니다.');
        return;
    }
    
    currentIncorrects.push(incorrect);
    input.value = '';
    renderIncorrects();
}

// 오답 렌더링
function renderIncorrects() {
    const container = document.getElementById('incorrectList');
    container.innerHTML = '';
    
    currentIncorrects.forEach((incorrect, index) => {
        const tag = document.createElement('div');
        tag.className = 'bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg flex items-center space-x-2';
        tag.innerHTML = `
            <span>${incorrect}</span>
            <button onclick="window.removeIncorrect(${index})" class="text-red-300 hover:text-red-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `;
        container.appendChild(tag);
    });
}

// 오답 제거
export function removeIncorrect(index) {
    currentIncorrects.splice(index, 1);
    renderIncorrects();
}

// 문제 카드 렌더링
function renderQuestions() {
    const container = document.getElementById('questionsList'); // ⭐ HTML과 일치
    const emptyState = document.getElementById('emptyState');
    
    if (!container) {
        console.error('questionsList 요소를 찾을 수 없습니다');
        return;
    }
    
    if (questions.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            emptyState.classList.remove('hidden');
        }
        return;
    }
    
    if (emptyState) {
        emptyState.classList.add('hidden');
    }
    container.innerHTML = '';
    
    questions.forEach((q, index) => {
        const questionType = detectQuestionType(q);
        
        // 타입별 한글명
        const typeNames = {
            'text': '텍스트',
            'image': '이미지', 
            'video': '영상',
            'audio': '소리'
        };
        const typeName = typeNames[questionType] || '텍스트';
        
        const card = document.createElement('div');
        card.className = 'bg-gray-800/50 rounded-2xl overflow-hidden border border-gray-700 hover:border-blue-500 transition-all duration-200 cursor-pointer transform hover:scale-105';
        
        // ⭐ 카드 클릭 이벤트 추가
        card.onclick = () => editQuestion(index);
        
        let previewContent = '';
        
        // 미리보기 콘텐츠 생성
        if (questionType === 'image' && q.imageBase64) {
            previewContent = `
                <div class="w-full h-48 bg-gray-900 overflow-hidden">
                    <img src="${q.imageBase64}" alt="문제 이미지" class="w-full h-full object-cover">
                </div>
            `;
        } else if ((questionType === 'video' || questionType === 'audio') && q.youtubeUrl) {
            const videoId = extractYoutubeVideoId(q.youtubeUrl);
            if (videoId) {
                previewContent = `
                    <div class="relative w-full h-48 bg-gray-900">
                        <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" 
                             alt="유튜브 썸네일" 
                             class="w-full h-full object-cover">
                        ${questionType === 'audio' ? '<div class="absolute top-2 right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded">소리만</div>' : ''}
                    </div>
                `;
            } else {
                previewContent = `
                    <div class="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-6">
                        <p class="text-white text-center text-lg font-medium line-clamp-4">${q.text || '제목 없음'}</p>
                    </div>
                `;
            }
        } else {
            const previewText = q.text || '제목 없음';
            previewContent = `
                <div class="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-6">
                    <p class="text-white text-center text-lg font-medium line-clamp-4">${previewText}</p>
                </div>
            `;
        }
        
        card.innerHTML = `
            ${previewContent}
            <div class="p-6">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                        <span class="text-sm font-medium text-blue-400">문제 ${index + 1}</span>
                        <span class="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">${typeName}</span>
                    </div>
                </div>
                <h3 class="text-white font-medium mb-2 line-clamp-2">${q.text || '제목 없음'}</h3>
                <div class="flex items-center justify-between text-sm text-gray-400">
                    <span>${q.timeLimit || 90}초</span>
                    <span>${q.answers?.length || 0}개 정답</span>
                </div>
                ${q.isChoice ? '<div class="mt-2 text-xs text-purple-400">객관식</div>' : ''}
            </div>
        `;
        
        container.appendChild(card);
    });
    
    updateQuestionCount();
}

// 사이드바 렌더링
function renderSidebar() {
    const sidebar = document.getElementById('questionSidebar');
    sidebar.innerHTML = '';
    
    if (questions.length === 0) {
        sidebar.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">문제가 없습니다</p>';
        return;
    }
    
    questions.forEach((q, index) => {
        // 문제 타입 자동 감지
        const questionType = detectQuestionType(q);
        
        const item = document.createElement('div');
        const isActive = index === currentEditingIndex;
        item.className = `rounded-lg cursor-pointer transition-all duration-200 overflow-hidden ${
            isActive 
            ? 'ring-2 ring-blue-500' 
            : 'hover:ring-2 hover:ring-gray-600'
        }`;
        item.onclick = () => editQuestion(index);
        
        // 문제 타입 이모지
        let typeName = '텍스트';
        if (questionType === 'image') {
            typeName = '이미지';
        } else if (questionType === 'video') {
            typeName = '영상';
        } else if (questionType === 'audio') {
            typeName = '소리';
        }
        
        // 미리보기 썸네일 생성 (높이를 120px로 증가)
        let thumbnailContent = '';
        
        if (questionType === 'image' && q.imageBase64) {
            // 이미지 문제
            thumbnailContent = `
                <div class="w-full h-[158px] bg-gray-900 overflow-hidden">
                    <img src="${q.imageBase64}" alt="미리보기" class="w-full h-full object-cover">
                </div>
            `;
        } else if ((questionType === 'video' || questionType === 'audio') && q.youtubeUrl) {
            // 영상/소리 문제
            const videoId = extractYoutubeVideoId(q.youtubeUrl);
            if (videoId) {
                const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                thumbnailContent = `
                    <div class="w-full h-[158px] bg-gray-900 overflow-hidden relative">
                        <img src="${thumbnailUrl}" alt="미리보기" class="w-full h-full object-cover">
                        <div class="absolute inset-0 flex items-center justify-center bg-black/40">
                            <svg class="w-8 h-8 text-white opacity-90" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </div>
                        ${questionType === 'audio' ? '<div class="absolute top-1 right-1 bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded">🔊</div>' : ''}
                    </div>
                `;
            } else {
                // 비디오 ID 추출 실패 시
                thumbnailContent = `
                    <div class="w-full h-[158px] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center px-2">
                        <p class="text-white text-xs text-center line-clamp-3">${q.text || '제목 없음'}</p>
                    </div>
                `;
            }
        } else {
            // 텍스트 문제
            thumbnailContent = `
                <div class="w-full h-[158px] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center px-2">
                    <p class="text-white text-xs text-center line-clamp-3">${q.text || '제목 없음'}</p>
                </div>
            `;
        }
        
        item.innerHTML = `
            ${thumbnailContent}
            <div class="p-2 ${isActive ? 'bg-blue-500' : 'bg-gray-700/50'}">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium ${isActive ? 'text-blue-100' : 'text-gray-400'}">문제 ${index + 1}</span>
                </div>
                <p class="text-xs font-medium truncate ${isActive ? 'text-white' : 'text-gray-300'}">${q.text || '제목 없음'}</p>
                <p class="text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'} mt-1">${q.timeLimit || 60}초 • ${q.answers?.length || 0}개 정답</p>
            </div>
        `;
        
        sidebar.appendChild(item);
    });
}

// 문제 수 업데이트
function updateQuestionCount() {
    document.getElementById('questionCount').textContent = `${questions.length}개 문제`;
}

// 새 문제 만들기
export function createNewQuestion() {
    if (questions.length >= 70) {
        alert('퀴즈에는 최대 70개의 문제만 추가할 수 있습니다.');
        return;
    }

    const newQuestion = {
        questionType: 'text', // 기본값: 텍스트 문제
        text: '',
        timeLimit: 60, // 90초 → 60초로 변경
        youtubeUrl: '',
        youtubeStartTime: 0,
        youtubeEndTime: 0,
        answerYoutubeUrl: '',
        answerYoutubeStartTime: 0,
        imageBase64: '',
        answerImageBase64: '',
        answers: [],
        incorrectAnswers: [],
        isChoice: false
    };
    
    questions.push(newQuestion);
    
    if (currentView === 'overview') {
        switchView('edit');
    }
    
    editQuestion(questions.length - 1);
    renderQuestions();
}

// 문제 편집 함수 (기존 문제 불러올 때)
export function editQuestion(index) {
    // 전체보기 뷰에서 클릭 시 편집 뷰로 전환
    if (currentView === 'overview') {
        switchView('edit');
    }

    currentEditingIndex = index;
    const question = questions[index];
    
    // 문제 타입 설정 (없으면 자동 감지)
    const questionType = question.questionType || detectQuestionType(question);
    
    // 자동 감지한 타입을 문제 객체에 저장
    if (!question.questionType) {
        question.questionType = questionType;
    }
    
    selectQuestionType(questionType);
    
    // 폼 데이터 채우기
    document.getElementById('questionText').value = question.text || '';
    document.getElementById('timeLimit').value = question.timeLimit || 90;
    document.getElementById('isMultipleChoice').checked = question.isChoice || false;
    
    // 이미지 데이터 로드
    questionImageBase64 = question.imageBase64 || '';
    if (questionImageBase64) {
        document.getElementById('questionImagePreview').querySelector('img').src = questionImageBase64;
        document.getElementById('questionImagePreview').classList.remove('hidden');
    } else {
        document.getElementById('questionImagePreview').classList.add('hidden');
    }
    
    answerImageBase64 = question.answerImageBase64 || '';
    if (answerImageBase64) {
        document.getElementById('answerImagePreview').querySelector('img').src = answerImageBase64;
        document.getElementById('answerImagePreview').classList.remove('hidden');
    } else {
        document.getElementById('answerImagePreview').classList.add('hidden');
    }
    
    // 유튜브 설정 로드
    document.getElementById('youtubeUrl').value = question.youtubeUrl || '';
    document.getElementById('startTime').value = secondsToTimeFormat(question.youtubeStartTime || 0);
    document.getElementById('endTime').value = secondsToTimeFormat(question.youtubeEndTime || 0);
    document.getElementById('answerYoutubeUrl').value = question.answerYoutubeUrl || '';
    document.getElementById('answerStartTime').value = secondsToTimeFormat(question.answerYoutubeStartTime || 0);
    
    // 정답/오답
    currentAnswers = [...(question.answers || [])];
    currentIncorrects = [...(question.incorrectAnswers || [])];
    
    renderAnswers();
    renderIncorrects();
    
    // 객관식 토글
    toggleMultipleChoice();
    
    // 유튜브 미리보기 업데이트
    if (question.youtubeUrl) {
        updateYoutubePreview();
    }
    if (question.answerYoutubeUrl) {
        updateAnswerYoutubePreview();
    }
    
    // 사이드바 업데이트
    renderSidebar();
}

export async function saveQuestion() {
    if (currentEditingIndex === null) return;
    
    const text = document.getElementById('questionText').value.trim();
    const timeLimitInput = document.getElementById('timeLimit');
    const timeLimitValue = timeLimitInput.value;
    const timeLimit = parseInt(timeLimitValue);
    const isChoice = document.getElementById('isMultipleChoice').checked;
    
    // 유효성 검사
    if (!text) {
        alert('문제를 입력하세요.');
        return;
    }
    
    if (isNaN(timeLimit) || timeLimit < 10 || timeLimit > 300) {
        alert('제한 시간은 10초에서 300초 사이여야 합니다.');
        return;
    }
    
    if (currentAnswers.length === 0) {
        alert('최소 1개 이상의 정답을 추가하세요.');
        return;
    }
    
    if (isChoice && currentIncorrects.length === 0) {
        alert('객관식 문제는 최소 1개 이상의 오답이 필요합니다.');
        return;
    }
    
    // 기본 문제 데이터
    let finalQuestionData = {
        questionType: currentQuestionType,
        text: text,
        timeLimit: timeLimit,
        answers: [...currentAnswers],
        incorrectAnswers: isChoice ? [...currentIncorrects] : [],
        isChoice: isChoice,
        imageBase64: null,
        answerImageBase64: null,
        youtubeUrl: null,
        youtubeStartTime: null,
        youtubeEndTime: null,
        answerYoutubeUrl: null,
        answerYoutubeStartTime: null,
        answerYoutubeEndTime: null
    };
    
    // 타입별 데이터 추가
    if (currentQuestionType === 'text') {
        // 텍스트 문제: 추가 데이터 없음
        
    } else if (currentQuestionType === 'image') {
        // 이미지 문제
        if (!questionImageBase64) {
            alert('문제 이미지를 업로드하세요.');
            return;
        }
        finalQuestionData.imageBase64 = questionImageBase64;
        finalQuestionData.answerImageBase64 = answerImageBase64 || null;
        
    } else if (currentQuestionType === 'video' || currentQuestionType === 'audio') {
        // 영상/소리 문제
        const youtubeUrl = document.getElementById('youtubeUrl').value.trim();
        if (!youtubeUrl) {
            alert('유튜브 URL을 입력하세요.');
            return;
        }
        
        finalQuestionData.youtubeUrl = youtubeUrl;
        finalQuestionData.youtubeStartTime = parseTimeToSeconds(document.getElementById('startTime').value) || 0;
        finalQuestionData.youtubeEndTime = parseTimeToSeconds(document.getElementById('endTime').value) || 0;
        
        const answerYoutubeUrl = document.getElementById('answerYoutubeUrl').value.trim();
        if (answerYoutubeUrl) {
            finalQuestionData.answerYoutubeUrl = answerYoutubeUrl;
            finalQuestionData.answerYoutubeStartTime = parseTimeToSeconds(document.getElementById('answerStartTime').value) || 0;
        }
    }
    
    // 문제 데이터 업데이트
    questions[currentEditingIndex] = finalQuestionData;

    try {
        await saveCurrentQuestion();  // ✅ 개별 문제만 저장
        alert('✅ 저장되었습니다!');
        renderQuestions();
        renderSidebar();
    } catch (error) {
        alert('❌ 저장 중 오류가 발생했습니다: ' + error.message);
    }
}

// 개별 문제 저장 (수정 시 사용)
async function saveCurrentQuestion() {
    if (currentEditingIndex === null) {
        throw new Error('저장할 문제가 선택되지 않았습니다.');
    }
    
    const questionData = questions[currentEditingIndex];
    
    const response = await fetchWithAuth(
        `/api/quiz/${quizId}/question/${currentEditingIndex}`, 
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionData)
        }
    );
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ 서버 오류:', errorData);
        throw new Error(errorData.message || '서버 저장 실패');
    }
    
    const result = await response.json();
    return result;
}

// 전체 문제 목록 저장 (삭제 시 사용)
async function saveAllQuestions() {
    console.log('📤 전체 문제 저장:', questions.length + '개');
    
    const response = await fetchWithAuth(
        `/api/quiz/${quizId}/questions`, 
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questions })
        }
    );
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ 서버 오류:', errorData);
        throw new Error(errorData.message || '서버 저장 실패');
    }
    
    const result = await response.json();
    console.log('✅ 전체 저장 성공:', result);
    return result;
}

// 현재 문제 삭제
export async function deleteCurrentQuestion() {
    if (currentEditingIndex === null) return;
    
    if (!confirm('이 문제를 삭제하시겠습니까?')) return;
    
    questions.splice(currentEditingIndex, 1);
    
    try {
        await saveAllQuestions();
        alert('삭제되었습니다!');
        
        // UI 초기화
        currentEditingIndex = null;
        currentAnswers = [];
        currentIncorrects = [];
        questionImageBase64 = '';
        answerImageBase64 = '';
        
        renderQuestions();
        renderSidebar();
        
        // 편집 뷰가 열려있다면 첫 번째 문제로 이동하거나 전체보기로 전환
        if (questions.length > 0) {
            editQuestion(0);
        } else {
            switchView('overview');
        }
    } catch (error) {
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    }
}

// 서버에서 문제 목록 로드
async function loadQuestions() {
    try {
        const response = await fetch(`/api/quiz/${quizId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('퀴즈를 불러올 수 없습니다');
        }
        
        const quiz = await response.json();
        document.getElementById('quizTitle').textContent = quiz.title || '퀴즈 편집';
        questions = quiz.questions || [];

        document.getElementById('isRandomOrder').checked = quiz.isRandomOrder || false;
        
        // 기존 문제들의 타입을 자동으로 감지하여 업데이트
        questions.forEach(q => {
            if (!q.questionType) {
                q.questionType = detectQuestionType(q);
            }
        });
        
        renderQuestions();
        updateQuestionCount();
    } catch (error) {
        alert('퀴즈를 불러오는 중 오류가 발생했습니다: ' + error.message);
    }
}

export function formatTimeOnBlur(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) return;
    
    // 숫자만 추출
    let numbers = input.value.replace(/\D/g, '');
    if (!numbers) {
        input.value = '';
        return;
    }
    
    // 최대 6자리까지만 (hhmmss)
    numbers = numbers.slice(0, 6);
    const len = numbers.length;
    
    let formatted = '';
    
    if (len <= 2) {
        // 1~2자리: 초만 (예: 5 → 5, 45 → 45)
        formatted = numbers;
    } else if (len <= 4) {
        // 3~4자리: 분:초 (예: 120 → 1:20, 152 → 1:52, 1234 → 12:34)
        const minutes = parseInt(numbers.slice(0, len - 2));
        const seconds = numbers.slice(len - 2);
        formatted = `${minutes}:${seconds}`;
    } else {
        // 5~6자리: 시:분:초 (예: 12011 → 01:20:11, 123456 → 12:34:56)
        const hours = numbers.slice(0, len - 4).padStart(2, '0');
        const minutes = numbers.slice(len - 4, len - 2);
        const seconds = numbers.slice(len - 2);
        formatted = `${hours}:${minutes}:${seconds}`;
    }
    
    input.value = formatted;
    
    // 미리보기 업데이트
    if (inputId === 'startTime' || inputId === 'endTime') {
        updateYoutubePreview();
    } else if (inputId === 'answerStartTime' || inputId === 'answerEndTime') {
        updateAnswerYoutubePreview();
    }
}

export async function saveRandomOrderSetting() {
    const isRandomOrder = document.getElementById('isRandomOrder').checked;
    const feedbackEl = document.getElementById('randomOrderSaveFeedback');

    try {
        const response = await fetchWithAuth(`/api/quiz/${quizId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isRandomOrder })
        });
        
        if (response.ok) {
            if(feedbackEl) {
                feedbackEl.textContent = '저장됨!';
                feedbackEl.classList.remove('opacity-0');
                setTimeout(() => {
                    feedbackEl.classList.add('opacity-0');
                }, 2000);
            }
        } else {
            if(feedbackEl) feedbackEl.textContent = '저장 실패';
            throw new Error('저장 실패');
        }
    } catch (error) {
        if(feedbackEl) {
            feedbackEl.textContent = '오류 발생';
            feedbackEl.classList.remove('opacity-0');
        }
        console.error('❌ 저장 중 오류가 발생했습니다: ', error.message);
    }
}

// 초기화
(async function init() {
    const authenticated = await initNavbar();
    if (!authenticated) return;
    
    if (quizId) {
        await loadQuestions();
    } else {
        alert('퀴즈 ID가 없습니다.');
        window.location.href = '/quiz/my-list';
        return;
    }
    
    // isRandomOrder 토글 자동 저장 리스너 추가
    const randomOrderToggle = document.getElementById('isRandomOrder');
    if (randomOrderToggle) {
        randomOrderToggle.addEventListener('change', saveRandomOrderSetting);
    }

    // 초기 폼 상태 업데이트
    updateFormVisibility();
})();

// 전역 함수 등록 (HTML에서 호출하기 위해)
window.selectQuestionType = selectQuestionType;
window.toggleMultipleChoice = toggleMultipleChoice;
window.switchView = switchView;
window.createNewQuestion = createNewQuestion;
window.editQuestion = editQuestion;
window.addAnswer = addAnswer;
window.removeAnswer = removeAnswer;
window.addIncorrect = addIncorrect;
window.removeIncorrect = removeIncorrect;
window.previewImage = previewImage;
window.removeImage = removeImage;
window.updateYoutubePreview = updateYoutubePreview;
window.updateAnswerYoutubePreview = updateAnswerYoutubePreview;
window.saveQuestion = saveQuestion;
window.deleteCurrentQuestion = deleteCurrentQuestion;
window.renderQuestions = renderQuestions;
window.extractYoutubeVideoId = extractYoutubeVideoId;
window.detectQuestionType = detectQuestionType;
window.updateFormVisibility = updateFormVisibility;
window.formatTimeOnBlur = formatTimeOnBlur;
window.saveRandomOrderSetting = saveRandomOrderSetting;