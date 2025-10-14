// admin-reports.js
import { renderNavbar, highlightCurrentPage } from './navbar.js';

let allReportedQuizzes = [];
let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentUser = null;
let tooltipHideTimer = null;

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
    // 네비바 렌더링
    const user = await renderNavbar();
    highlightCurrentPage();

    if (!user) {
      alert('로그인이 필요합니다.');
      window.location.href = '/login';
      return;
    }

    // 관리자 권한 체크
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      alert('관리자 권한이 필요합니다.');
      window.location.href = '/';
      return;
    }

    currentUser = user;

    // 신고된 퀴즈 목록 로드
    await loadReportedQuizzes();

    // 무한 스크롤 이벤트 리스너
    window.addEventListener('scroll', handleScroll);
  } catch (error) {
    console.error('페이지 초기화 실패:', error);
    alert('페이지 초기화 중 오류가 발생했습니다.');
  }
}

// 신고된 퀴즈 목록 로드
async function loadReportedQuizzes(reset = false) {
  if (isLoading || (!hasMore && !reset)) return;

  try {
    isLoading = true;

    if (reset) {
      currentPage = 1;
      allReportedQuizzes = [];
      hasMore = true;
    }

    // 로딩 상태 표시
    if (currentPage === 1) {
      document.getElementById('loadingState').classList.remove('hidden');
      document.getElementById('reportsContainer').classList.add('hidden');
      document.getElementById('emptyState').classList.add('hidden');
    } else {
      showLoadMoreIndicator();
    }

    const response = await fetchWithAuth(`/admin/reported-quizzes?page=${currentPage}&limit=40`);

    if (!response.ok) {
      if (response.status === 403) {
        alert('관리자 권한이 필요합니다.');
        window.location.href = '/';
        return;
      }
      throw new Error('신고된 퀴즈 목록 로드 실패');
    }

    const data = await response.json();

    // 새로운 퀴즈 추가
    allReportedQuizzes = [...allReportedQuizzes, ...data.quizzes];
    hasMore = data.pagination.hasMore;

    // 렌더링
    renderReportedQuizzes();

    // 로딩 상태 업데이트
    document.getElementById('loadingState').classList.add('hidden');
    hideLoadMoreIndicator();

    if (allReportedQuizzes.length === 0) {
      document.getElementById('emptyState').classList.remove('hidden');
    } else {
      document.getElementById('reportsContainer').classList.remove('hidden');
    }

    // 다음 페이지 준비
    currentPage++;
  } catch (err) {
    console.error('신고된 퀴즈 로드 에러:', err);
    if (currentPage === 1) {
      document.getElementById('loadingState').innerHTML = `
        <p class="text-red-400">신고된 퀴즈 목록을 불러오는데 실패했습니다.</p>
        <button onclick="location.reload()" class="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg">
          다시 시도
        </button>
      `;
    }
    hideLoadMoreIndicator();
  } finally {
    isLoading = false;
  }
}

// 문제 이미지 미리보기 툴팁 생성
function createImagePreviewTooltip(questions) {
  if (!questions || questions.length === 0) {
    return '';
  }

  // 이미지가 있는 문제만 필터링
  const questionsWithImages = questions.filter(q => q.imageBase64 || q.answerImageBase64);

  if (questionsWithImages.length === 0) {
    return '<div class="image-preview-tooltip absolute left-full ml-2 top-0 hidden bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50">이미지 없음</div>';
  }

  const imageItems = questionsWithImages.map((q, idx) => {
    let html = '';
    if (q.imageBase64) {
      html += `<div class="mb-2"><div class="text-xs text-gray-400 mb-1">문제 ${q.order || idx + 1}</div><img src="${q.imageBase64}" class="w-32 h-24 object-cover rounded"></div>`;
    }
    if (q.answerImageBase64) {
      html += `<div class="mb-2"><div class="text-xs text-gray-400 mb-1">정답 ${q.order || idx + 1}</div><img src="${q.answerImageBase64}" class="w-32 h-24 object-cover rounded"></div>`;
    }
    return html;
  }).join('');

  return `
    <div class="image-preview-tooltip absolute left-full ml-2 top-0 hidden bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl z-50 max-h-96 overflow-y-auto" style="min-width: 150px;">
      <div class="text-xs font-semibold text-gray-300 mb-2">문제 이미지 (${questionsWithImages.length})</div>
      ${imageItems}
    </div>
  `;
}

// 툴팁 표시
function showTooltip(tooltip) {
  clearTimeout(tooltipHideTimer);
  tooltip.classList.remove('hidden');
}

// 툴팁 숨기기 (딜레이 포함)
function hideTooltip(tooltip, delay = 300) {
  clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    tooltip.classList.add('hidden');
  }, delay);
}

// 툴팁 이벤트 설정
function setupTooltipEvents(thumbnailElement, tooltip) {
  // 썸네일에 마우스 올리면 표시
  thumbnailElement.addEventListener('mouseenter', () => {
    showTooltip(tooltip);
  });

  // 썸네일에서 마우스 벗어나면 딜레이 후 숨김
  thumbnailElement.addEventListener('mouseleave', () => {
    hideTooltip(tooltip);
  });

  // 툴팁에 마우스 올리면 계속 표시
  tooltip.addEventListener('mouseenter', () => {
    showTooltip(tooltip);
  });

  // 툴팁에서 마우스 벗어나면 딜레이 후 숨김
  tooltip.addEventListener('mouseleave', () => {
    hideTooltip(tooltip);
  });
}

// 신고된 퀴즈 렌더링
function renderReportedQuizzes() {
  const container = document.getElementById('reportsContainer');
  container.innerHTML = '';

  allReportedQuizzes.forEach(quiz => {
    const card = createQuizCard(quiz);
    container.appendChild(card);
  });
}

// 퀴즈 카드 생성
function createQuizCard(quiz) {
  const card = document.createElement('div');
  card.className = 'bg-black/30 rounded-2xl p-6 shadow-xl border border-gray-600 cursor-pointer hover:bg-black/40 transition-colors';

  const isSeized = quiz.creatorId === 'seized';
  const createdDate = new Date(quiz.createdAt).toLocaleDateString('ko-KR');

  card.innerHTML = `
    <!-- 퀴즈 정보 -->
    <div class="flex items-start gap-4 mb-4">
      <div class="relative flex-shrink-0">
        ${quiz.titleImageBase64 ? `
          <img src="${quiz.titleImageBase64}" alt="썸네일" class="w-24 h-24 rounded-lg object-cover cursor-pointer">
        ` : `
          <div class="w-24 h-24 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white font-bold text-2xl cursor-pointer">
            Q
          </div>
        `}
        ${createImagePreviewTooltip(quiz.questions)}
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-xl font-bold text-white mb-2">${quiz.title}</h3>
        <p class="text-gray-400 text-sm mb-3">${quiz.description || '설명 없음'}</p>
        <div class="flex flex-wrap gap-3 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-gray-500">작성자:</span>
            <span class="text-white">${quiz.creator.nickname}</span>
            <span class="text-gray-500">(${quiz.creator.email})</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-500">문제 수:</span>
            <span class="text-white">${quiz.questions?.length || 0}개</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gray-500">생성일:</span>
            <span class="text-white">${createdDate}</span>
          </div>
          <div class="flex items-center gap-2">
            ${isSeized ? `
              <span class="px-2 py-1 rounded text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500">
                압수됨
              </span>
            ` : `
              <span class="px-2 py-1 rounded text-xs font-semibold ${
                quiz.isComplete
                  ? 'bg-green-500/20 text-green-400 border border-green-500'
                  : 'bg-red-500/20 text-red-400 border border-red-500'
              }">
                ${quiz.isComplete ? '공개' : '비공개'}
              </span>
            `}
          </div>
        </div>
      </div>
    </div>

    <!-- 신고 내역 -->
    <div class="border-t border-gray-700 pt-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-lg font-semibold text-red-400">신고 내역 (${quiz.reports.length}건)</h4>
        <div class="flex gap-2">
          ${!isSeized ? `
            <button
              onclick="seizeQuizFromReport('${quiz._id}', '${quiz.title.replace(/'/g, "\\'")}')"
              class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              압수하기
            </button>
          ` : `
            <button
              onclick="restoreQuizFromReport('${quiz._id}', '${quiz.title.replace(/'/g, "\\'")}')"
              class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              복구하기
            </button>
          `}
          ${currentUser && currentUser.role === 'superadmin' ? `
            <button
              onclick="deleteQuizFromReport('${quiz._id}', '${quiz.title.replace(/'/g, "\\'")}')"
              class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              영구삭제
            </button>
          ` : ''}
          <button
            onclick="dismissReports('${quiz._id}', '${quiz.title.replace(/'/g, "\\'")}')"
            class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            신고 삭제
          </button>
        </div>
      </div>

      <!-- 신고 목록 -->
      <div class="space-y-2">
        ${quiz.reports.map((report, index) => `
          <div class="bg-gray-800/50 rounded-lg p-3">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-white font-medium">${report.reporter.nickname}</span>
                  <span class="text-gray-500 text-xs">(${report.reporter.email})</span>
                  <span class="text-gray-500 text-xs">
                    ${new Date(report.reportedAt).toLocaleString('ko-KR')}
                  </span>
                </div>
                <p class="text-gray-300 text-sm">${report.reason}</p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 카드 클릭 이벤트 - 퀴즈 편집 페이지로 이동
  card.onclick = (e) => {
    // 버튼 클릭은 무시
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }
    window.location.href = `/quiz/edit?quizId=${quiz._id}`;
  };

  // 썸네일 이미지 미리보기 툴팁 이벤트 설정
  // DOM에 삽입된 후 이벤트를 연결하기 위해 다음 틱에 실행
  setTimeout(() => {
    const thumbnailContainer = card.querySelector('.relative.flex-shrink-0');
    const tooltip = card.querySelector('.image-preview-tooltip');
    if (thumbnailContainer && tooltip) {
      const thumbnailElement = thumbnailContainer.querySelector('img, div.w-24');
      if (thumbnailElement) {
        setupTooltipEvents(thumbnailElement, tooltip);
      }
    }
  }, 0);

  return card;
}

// 퀴즈 압수
async function seizeQuizFromReport(quizId, title) {
  const reason = prompt(`"${title}" 퀴즈를 압수하시겠습니까?\n\n압수 사유를 입력하세요 (선택사항):`);

  if (reason === null) {
    return;
  }

  try {
    const response = await fetchWithAuth(`/admin/quizzes/${quizId}/seize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '관리자 조치' })
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      await loadReportedQuizzes(true); // 목록 새로고침
    } else {
      alert(data.message || '압수 처리 중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('Quiz seize error:', err);
    alert('압수 처리 중 오류가 발생했습니다.');
  }
}

// 퀴즈 복구
async function restoreQuizFromReport(quizId, title) {
  if (!confirm(`"${title}" 퀴즈를 원본 작성자에게 복구하시겠습니까?`)) {
    return;
  }

  try {
    const response = await fetchWithAuth(`/admin/quizzes/${quizId}/restore`, {
      method: 'POST'
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      await loadReportedQuizzes(true); // 목록 새로고침
    } else {
      alert(data.message || '복구 처리 중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('Quiz restore error:', err);
    alert('복구 처리 중 오류가 발생했습니다.');
  }
}

// 퀴즈 영구 삭제
async function deleteQuizFromReport(quizId, title) {
  if (!confirm(`"${title}" 퀴즈를 영구 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`)) {
    return;
  }

  try {
    const response = await fetchWithAuth(`/admin/quizzes/${quizId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      await loadReportedQuizzes(true); // 목록 새로고침
    } else {
      alert(data.message || '삭제 중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('Quiz delete error:', err);
    alert('삭제 중 오류가 발생했습니다.');
  }
}

// 신고 삭제 (조치 없이 신고만 삭제)
async function dismissReports(quizId, title) {
  if (!confirm(`"${title}" 퀴즈의 모든 신고를 삭제하시겠습니까?\n\n퀴즈는 그대로 유지됩니다.`)) {
    return;
  }

  try {
    const response = await fetchWithAuth(`/admin/quizzes/${quizId}/reports`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
      await loadReportedQuizzes(true); // 목록 새로고침
    } else {
      alert(data.message || '신고 삭제 중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('Report dismiss error:', err);
    alert('신고 삭제 중 오류가 발생했습니다.');
  }
}

// 무한 스크롤 핸들러
function handleScroll() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;

  // 하단에서 200px 정도 남았을 때 로드
  if (scrollTop + clientHeight >= scrollHeight - 200) {
    loadReportedQuizzes();
  }
}

// 로딩 인디케이터 표시
function showLoadMoreIndicator() {
  let indicator = document.getElementById('loadMoreIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'loadMoreIndicator';
    indicator.className = 'text-center py-8';
    indicator.innerHTML = `
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      <p class="text-gray-400 mt-2">추가 퀴즈를 불러오는 중...</p>
    `;
    document.getElementById('reportsContainer').appendChild(indicator);
  }
  indicator.classList.remove('hidden');
}

// 로딩 인디케이터 숨기기
function hideLoadMoreIndicator() {
  const indicator = document.getElementById('loadMoreIndicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

// 전역 함수로 등록
window.seizeQuizFromReport = seizeQuizFromReport;
window.restoreQuizFromReport = restoreQuizFromReport;
window.deleteQuizFromReport = deleteQuizFromReport;
window.dismissReports = dismissReports;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);
