// quiz-comments.js - 퀴즈 댓글 관리 모듈

let currentQuizId = null;
let currentUser = null;

/**
 * 댓글 모듈 초기화
 * @param {string} quizId - 퀴즈 ID
 * @param {object} user - 현재 로그인한 사용자 정보
 */
export function initializeComments(quizId, user) {
  currentQuizId = quizId;
  currentUser = user;

  // 댓글 입력 이벤트 리스너 등록
  const commentForm = document.getElementById('commentForm');
  const commentInput = document.getElementById('commentInput');
  const submitCommentBtn = document.getElementById('submitCommentBtn');

  if (commentForm && commentInput && submitCommentBtn) {
    // 폼 제출 이벤트
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitComment();
    });

    // 입력 필드 변경 이벤트 (버튼 활성화/비활성화)
    commentInput.addEventListener('input', () => {
      const content = commentInput.value.trim();
      submitCommentBtn.disabled = content.length === 0;
    });
  }

  // 초기 댓글 로드
  loadComments();
}

/**
 * 댓글 목록 로드
 */
export async function loadComments() {
  if (!currentQuizId) {
    console.error('퀴즈 ID가 설정되지 않았습니다.');
    return;
  }

  const commentsContainer = document.getElementById('commentsContainer');
  const commentsLoading = document.getElementById('commentsLoading');
  const commentsError = document.getElementById('commentsError');

  if (!commentsContainer) {
    console.error('댓글 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 로딩 상태 표시
  if (commentsLoading) commentsLoading.classList.remove('hidden');
  if (commentsError) commentsError.classList.add('hidden');
  commentsContainer.innerHTML = '';

  try {
    const response = await fetch(`/api/quiz/${currentQuizId}/comments`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('댓글을 불러오는 데 실패했습니다.');
    }

    const data = await response.json();
    const comments = data.comments || [];

    // 로딩 상태 숨김
    if (commentsLoading) commentsLoading.classList.add('hidden');

    // 댓글 렌더링
    if (comments.length === 0) {
      commentsContainer.innerHTML = `
        <div class="text-center py-8 text-gray-400">
          <p>아직 댓글이 없습니다.</p>
          <p class="text-sm mt-2">첫 번째 댓글을 작성해보세요!</p>
        </div>
      `;
    } else {
      commentsContainer.innerHTML = comments.map(comment => createCommentHTML(comment)).join('');
    }
  } catch (error) {
    console.error('댓글 로드 오류:', error);
    if (commentsLoading) commentsLoading.classList.add('hidden');
    if (commentsError) {
      commentsError.classList.remove('hidden');
      commentsError.textContent = error.message;
    }
  }
}

/**
 * 댓글 HTML 생성
 * @param {object} comment - 댓글 객체
 * @returns {string} 댓글 HTML
 */
function createCommentHTML(comment) {
  const profileImage = comment.profileImage || null;
  const nickname = comment.nickname || 'Unknown';
  const content = escapeHtml(comment.content);
  const createdAt = formatDate(comment.createdAt);

  // 프로필 이미지 또는 기본 아바타
  const avatarHTML = profileImage
    ? `<img src="${profileImage}" alt="${nickname}님의 프로필" class="w-10 h-10 rounded-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
       <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm" style="display: none;">
         ${nickname.charAt(0).toUpperCase()}
       </div>`
    : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
         ${nickname.charAt(0).toUpperCase()}
       </div>`;

  return `
    <div class="py-3">
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0">
          ${avatarHTML}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-white text-sm">${nickname}</span>
            <span class="text-xs text-gray-400">${createdAt}</span>
          </div>
          <p class="text-sm text-gray-200 whitespace-pre-wrap break-words">${content}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * 댓글 제출
 */
async function submitComment() {
  const commentInput = document.getElementById('commentInput');
  const submitCommentBtn = document.getElementById('submitCommentBtn');

  if (!commentInput || !submitCommentBtn) {
    console.error('댓글 입력 요소를 찾을 수 없습니다.');
    return;
  }

  const content = commentInput.value.trim();

  if (!content) {
    alert('댓글 내용을 입력해주세요.');
    return;
  }

  if (content.length > 500) {
    alert('댓글은 최대 500자까지 작성할 수 있습니다.');
    return;
  }

  if (!currentUser) {
    alert('로그인이 필요합니다.');
    window.location.href = '/login';
    return;
  }

  // 버튼 비활성화 및 로딩 상태
  submitCommentBtn.disabled = true;
  const originalText = submitCommentBtn.innerHTML;
  submitCommentBtn.innerHTML = '<svg class="animate-spin h-4 w-4 mx-auto" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';

  try {
    const response = await fetch(`/api/quiz/${currentQuizId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || '댓글 작성에 실패했습니다.');
    }

    const data = await response.json();

    if (data.success) {
      // 입력 필드 초기화
      commentInput.value = '';

      // 댓글 목록 새로고침
      await loadComments();

      // 성공 메시지 (선택사항)
      // alert('댓글이 작성되었습니다.');
    }
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    alert(error.message);
  } finally {
    // 버튼 원상복구
    submitCommentBtn.innerHTML = originalText;
    submitCommentBtn.disabled = false;
  }
}

/**
 * HTML 이스케이프 (XSS 방지)
 * @param {string} text
 * @returns {string}
 */
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

/**
 * 날짜 포맷팅
 * @param {string|Date} date
 * @returns {string}
 */
function formatDate(date) {
  const now = new Date();
  const commentDate = new Date(date);
  const diff = now - commentDate;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return '방금 전';
  } else if (minutes < 60) {
    return `${minutes}분 전`;
  } else if (hours < 24) {
    return `${hours}시간 전`;
  } else if (days < 7) {
    return `${days}일 전`;
  } else {
    const year = commentDate.getFullYear();
    const month = String(commentDate.getMonth() + 1).padStart(2, '0');
    const day = String(commentDate.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }
}
