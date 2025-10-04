export async function getUserData() {
  try {
    const response = await fetch('/auth/me', { 
      credentials: 'include' 
    });
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error('사용자 정보 로드 실패:', err);
    return null;
  }
}

// 프로필 이미지 컴포넌트 생성 함수
function createProfileImage(user) {
  const profileImageUrl = user.profileImage;
  const displayName = user.nickname || user.username;
  
  if (profileImageUrl && profileImageUrl !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png') {
    // 실제 프로필 이미지가 있는 경우
    return `
      <img 
        src="${profileImageUrl}" 
        alt="${displayName}님의 프로필" 
        class="w-8 h-8 rounded-full object-cover border-2 border-white/20"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      >
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20" style="display: none;">
        ${displayName.charAt(0).toUpperCase()}
      </div>
    `;
  } else {
    // 기본 이미지이거나 이미지가 없는 경우 - 이니셜 아바타 사용
    return `
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-white/20">
        ${displayName.charAt(0).toUpperCase()}
      </div>
    `;
  }
}

// 상단바 HTML 생성 함수
function createNavbarHTML(user = null) {
  return `
    <nav class="bg-[#222230] text-white shadow-lg mx-auto px-4">
      <div class="max-w-[1080px] mx-auto sm:px-0 px-4">
        <div class="flex justify-between items-center h-14 sm:h-16">
          <!-- 로고 및 데스크톱 메뉴 -->
          <div class="flex items-center">
            <!-- 로고 -->
            <a href="/" class="flex items-center space-x-3 hover:opacity-80 transition-opacity flex-shrink-0">
              <img 
                src="/images/logo.png" 
                alt="QuizApp 로고" 
                class="h-8 w-auto sm:h-10"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"
              >
              <span class="text-lg sm:text-xl font-bold text-white hidden" id="fallbackLogo">QQ</span>
            </a>
            
            ${user ? `
              <!-- 데스크톱 네비게이션 (768px 이상) -->
              <div class="hidden md:flex ml-6 lg:ml-8 space-x-4 lg:space-x-6">
                <a href="/quiz/my-list" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                  나의 퀴즈
                </a>
                <button onclick="openCreateQuizModal()" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                  퀴즈 만들기
                </button>
              </div>
            ` : ''}
          </div>
          
          <!-- 데스크톱 사용자 메뉴 -->
          <div class="hidden sm:flex items-center space-x-2 lg:space-x-4">
            ${user ? `
              <!-- 사용자 프로필 -->
              <div class="flex items-center space-x-3">
                <button onclick="goToMyPage()" class="flex items-center space-x-3 hover:opacity-80 transition-opacity">
                  ${createProfileImage(user)}
                  <span class="text-xs lg:text-sm hidden md:block">
                    <span class="font-semibold">${user.nickname || user.username}</span>님
                  </span>
                </button>
              </div>
              <button 
                id="logoutBtn"
                class="bg-[#8BA2FA] hover:bg-[#617DE9] px-2 py-1 lg:px-4 lg:py-2 rounded-md transition-colors text-xs lg:text-sm font-medium"
              >
                로그아웃
              </button>
            ` : `
              <a 
                href="/login" 
                class="bg-[#8BA2FA] hover:bg-[#617DE9] px-2 py-1 lg:px-4 lg:py-2 rounded-md transition-colors text-xs lg:text-sm font-medium"
              >
                로그인
              </a>
              <a 
                href="/signup" 
                class="bg-[#8BA2FA] hover:bg-[#617DE9] px-2 py-1 lg:px-4 lg:py-2 rounded-md transition-colors text-xs lg:text-sm font-medium"
              >
                회원가입
              </a>
            `}
          </div>

          <!-- 모바일 햄버거 메뉴 버튼 -->
          <div class="sm:hidden">
            <button 
              id="mobileMenuBtn" 
              class="p-2 rounded-md hover:bg-gray-700 transition-colors"
              aria-label="메뉴 열기"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- 모바일 메뉴 (320px ~ 639px) -->
        <div id="mobileMenu" class="sm:hidden hidden border-t border-gray-700">
          <div class="py-3 space-y-2">
            ${user ? `
              <!-- 사용자 정보 -->
              <div class="px-2 py-2 text-sm border-b border-gray-700 mb-2">
                <button onclick="goToMyPage()" class="flex items-center space-x-3 hover:bg-gray-700 rounded-md p-2 w-full text-left transition-colors">
                  ${createProfileImage(user)}
                  <span class="font-semibold">${user.nickname || user.username}</span>님
                </button>
              </div>
              
              <!-- 네비게이션 링크 -->
              <a href="/quiz/my-list" class="block px-2 py-2 hover:bg-gray-700 rounded-md transition-colors text-sm">
                나의 퀴즈
              </a>
              <button onclick="openCreateQuizModal()" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                퀴즈 만들기
              </button>
              
              <!-- 로그아웃 버튼 -->
              <button 
                id="logoutBtnMobile"
                class="w-full text-left px-2 py-2 bg-red-500 hover:bg-red-600 rounded-md transition-colors text-sm font-medium mt-3"
              >
                로그아웃
              </button>
            ` : `
              <!-- 로그인/회원가입 버튼 -->
              <div class="space-y-2 px-2">
                <a 
                  href="/login" 
                  class="block w-full text-center bg-green-500 hover:bg-green-600 px-3 py-2 rounded-md transition-colors text-sm font-medium"
                >
                  로그인
                </a>
                <a 
                  href="/signup" 
                  class="block w-full text-center bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-md transition-colors text-sm font-medium"
                >
                  회원가입
                </a>
              </div>
            `}
          </div>
        </div>
      </div>
    </nav>
  `;
}

// 모바일 메뉴 토글 함수
function toggleMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  
  if (mobileMenu && mobileMenuBtn) {
    const isHidden = mobileMenu.classList.contains('hidden');
    
    if (isHidden) {
      mobileMenu.classList.remove('hidden');
      mobileMenuBtn.setAttribute('aria-label', '메뉴 닫기');
      mobileMenuBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      `;
    } else {
      mobileMenu.classList.add('hidden');
      mobileMenuBtn.setAttribute('aria-label', '메뉴 열기');
      mobileMenuBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      `;
    }
  }
}

// 로그아웃 처리 함수
async function handleLogout() {
  try {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    
    if (response.ok) {
      alert('로그아웃 되었습니다.');
      
      const protectedPages = ['/quiz/my-list', '/quiz/init', '/quiz/edit'];
      const currentPath = window.location.pathname;
      
      if (protectedPages.some(page => currentPath.includes(page))) {
        window.location.href = '/';
      } else {
        window.location.reload();
      }
    } else {
      alert('로그아웃에 실패했습니다.');
    }
  } catch (err) {
    console.error('로그아웃 에러:', err);
    alert('로그아웃 중 오류가 발생했습니다.');
  }
}

// 화면 크기 변경 시 모바일 메뉴 숨기기
function handleResize() {
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  
  if (window.innerWidth >= 640 && mobileMenu && !mobileMenu.classList.contains('hidden')) {
    mobileMenu.classList.add('hidden');
    if (mobileMenuBtn) {
      mobileMenuBtn.setAttribute('aria-label', '메뉴 열기');
      mobileMenuBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      `;
    }
  }
}

// 로고 로드 실패 시 폴백 처리
function handleLogoError() {
  const logoImg = document.querySelector('nav img[alt*="로고"]');
  const fallbackText = document.getElementById('fallbackLogo');
  
  if (logoImg && fallbackText) {
    logoImg.style.display = 'none';
    fallbackText.style.display = 'inline-block';
    fallbackText.classList.remove('hidden');
  }
}

// 마이페이지로 이동하는 함수
function goToMyPage() {
  window.location.href = '/my-page';
}

// 이벤트 리스너 추가 함수
function attachNavbarListeners() {
  // 데스크톱 로그아웃 버튼
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
  
  // 모바일 로그아웃 버튼
  const logoutBtnMobile = document.getElementById('logoutBtnMobile');
  if (logoutBtnMobile) {
    logoutBtnMobile.addEventListener('click', handleLogout);
  }
  
  // 모바일 메뉴 토글 버튼
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
  }
  
  // 화면 크기 변경 이벤트
  window.addEventListener('resize', handleResize);
  
  // 모바일 메뉴 링크 클릭 시 메뉴 닫기
  const mobileMenuLinks = document.querySelectorAll('#mobileMenu a');
  mobileMenuLinks.forEach(link => {
    link.addEventListener('click', () => {
      const mobileMenu = document.getElementById('mobileMenu');
      if (mobileMenu) {
        mobileMenu.classList.add('hidden');
      }
    });
  });
  
  // 전역 함수로 goToMyPage 등록
  window.goToMyPage = goToMyPage;
}

// 메인 상단바 렌더링 함수 (외부에서 호출)
export async function renderNavbar() {
  try {
    const user = await getUserData();
    
    const existingNavbar = document.getElementById('navbar');
    if (existingNavbar) {
      existingNavbar.remove();
    }
    
    window.removeEventListener('resize', handleResize);
    
    const navbarHTML = createNavbarHTML(user);
    document.body.insertAdjacentHTML('afterbegin', `<div id="navbar">${navbarHTML}</div>`);
    
    attachNavbarListeners();
    
    return user;
    
  } catch (err) {
    console.error('상단바 렌더링 에러:', err);
    const navbarHTML = createNavbarHTML();
    document.body.insertAdjacentHTML('afterbegin', `<div id="navbar">${navbarHTML}</div>`);
    attachNavbarListeners();
    return null;
  }
}

// 현재 페이지 하이라이트 함수
export function highlightCurrentPage() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('#navbar a:not([href="/"])'); // 로고 링크 제외
  
  links.forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('text-blue-200', 'font-semibold');
    }
  });
}

// 상단바 업데이트 함수 (로그인 후 호출용)
export async function updateNavbar() {
  const user = await renderNavbar();
  highlightCurrentPage();
  return user;
}

// 퀴즈 만들기 모달 HTML을 body에 추가하는 함수
export function initializeQuizModal() {
  // 이미 모달이 있으면 추가하지 않음
  if (document.getElementById('createQuizModal')) {
    return;
  }

  const modalHTML = `
    <!-- 퀴즈 만들기 모달 -->
    <div id="createQuizModal" class="fixed inset-0 bg-black bg-opacity-50 z-50 p-4 hidden" onclick="handleQuizModalClick(event)">
      <div class="bg-[#222230] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" onclick="event.stopPropagation()">
        <!-- 모달 헤더 -->
        <div class="sticky top-0 border-b border-gray-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
          <h2 class="text-xl font-bold text-white">새 퀴즈 만들기</h2>
          <button onclick="closeCreateQuizModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- 모달 본문 -->
        <div class="p-6 space-y-6">
          <!-- 퀴즈 제목 -->
          <div>
            <label for="createQuizTitle" class="block text-sm font-semibold text-white mb-2">
              퀴즈 제목 <span class="text-red-500">*</span>
            </label>
            <input 
              type="text" 
              id="createQuizTitle" 
              placeholder="예: 대한민국 역사 퀴즈"
              class="w-full px-4 py-3 text-white bg-black/30 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              maxlength="100"
            >
          </div>

          <!-- 퀴즈 설명 -->
          <div>
            <label for="createQuizDescription" class="block text-sm font-semibold text-white mb-2">
              퀴즈 설명
            </label>
            <textarea 
              id="createQuizDescription" 
              placeholder="퀴즈에 대한 간단한 설명을 입력하세요 (선택사항)"
              rows="4"
              class="w-full px-4 py-3 text-white bg-black/30 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              maxlength="500"
            ></textarea>
          </div>

          <!-- 썸네일 이미지 -->
          <div>
            <label for="createQuizThumbnail" class="block text-sm font-semibold text-white mb-2">
              대표 이미지 (썸네일) <span class="text-red-500">*</span>
            </label>
            <div class="space-y-3">
              <!-- 파일 선택 버튼 -->
              <label class="flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-500 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-black/30 transition-all">
                <svg class="w-6 h-6 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <span class="text-gray-300 font-medium">이미지 선택하기</span>
                <input 
                  type="file" 
                  id="createQuizThumbnail" 
                  accept="image/*" 
                  onchange="handleThumbnailPreview(event)"
                  class="hidden"
                >
              </label>
              
              <!-- 이미지 미리보기 -->
              <div id="thumbnailPreview" class="hidden">
                <img 
                  id="thumbnailPreviewImage" 
                  alt="썸네일 미리보기"
                  class="w-full max-h-64 object-contain rounded-lg border border-gray-600"
                >
              </div>
              
              <p class="text-xs text-gray-300">
                권장: 16:9 비율, 최대 6MB
              </p>
            </div>
          </div>
        </div>

        <!-- 모달 푸터 -->
        <div class="sticky bottom-0 px-6 py-4 flex justify-end gap-3 rounded-b-2xl border-t border-gray-600">
          <button 
            onclick="closeCreateQuizModal()" 
            class="px-6 py-2.5 border border-gray-300 text-white rounded-lg hover:bg-blue-400 hover:border-blue-400 transition-colors font-medium"
          >
            취소
          </button>
          <button 
            id="createQuizBtn"
            onclick="submitCreateQuiz()" 
            class="px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all shadow-md hover:shadow-lg font-medium"
          >
            퀴즈 만들기
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 모달 배경 클릭 처리
function handleQuizModalClick(event) {
  if (event.target.id === 'createQuizModal') {
    closeCreateQuizModal();
  }
}

// 퀴즈 만들기 모달 열기
export function openCreateQuizModal() {
  const modal = document.getElementById('createQuizModal');
  if (!modal) {
    initializeQuizModal();
  }
  
  // 입력 필드 초기화
  document.getElementById('createQuizTitle').value = '';
  document.getElementById('createQuizDescription').value = '';
  document.getElementById('createQuizThumbnail').value = '';
  document.getElementById('thumbnailPreview').classList.add('hidden');
  
  const modalElement = document.getElementById('createQuizModal');
  modalElement.classList.remove('hidden');
}

// 퀴즈 만들기 모달 닫기
export function closeCreateQuizModal() {
  const modal = document.getElementById('createQuizModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// 썸네일 미리보기 처리
function handleThumbnailPreview(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const preview = document.getElementById('thumbnailPreview');
  const previewImage = document.getElementById('thumbnailPreviewImage');
  
  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('미리보기 실패:', error);
  }
}

// 이미지 리사이즈 함수
async function resizeImageToBase64(file, maxKB = 200, minKB = 30) {
  return new Promise((resolve, reject) => {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 5) {
      return reject(new Error('5MB를 초과한 이미지는 업로드할 수 없습니다.'));
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const tryResize = (scale = 1.0) => {
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          let qualities = sizeMB >= 2 ? [0.5, 0.3, 0.1] : [0.9, 0.8, 0.7, 0.6];

          for (let q of qualities) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', q);
            const sizeInKB = Math.round((base64.length * 3) / 4 / 1024);

            if (sizeInKB <= maxKB && sizeInKB >= minKB) {
              resolve(base64);
              return true;
            }
          }
          return false;
        };

        const scales = [1.0, 0.8, 0.6, 0.4];
        for (let s of scales) {
          if (tryResize(s)) return;
        }

        canvas.width = img.width * 0.3;
        canvas.height = img.height * 0.3;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const fallback = canvas.toDataURL('image/jpeg', 0.3);
        resolve(fallback);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 퀴즈 생성 제출
async function submitCreateQuiz() {
  const title = document.getElementById('createQuizTitle').value.trim();
  const description = document.getElementById('createQuizDescription').value.trim();
  const thumbnailFile = document.getElementById('createQuizThumbnail').files[0];
  
  if (!title) {
    alert('퀴즈 제목을 입력해주세요.');
    return;
  }
  
  if (!thumbnailFile) {
    alert('썸네일 이미지를 선택해주세요.');
    return;
  }
  
  try {
    // 이미지 리사이즈
    const titleImageBase64 = await resizeImageToBase64(thumbnailFile);
    
    // API 호출
    const response = await fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        title, 
        description, 
        titleImageBase64 
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('퀴즈가 생성되었습니다!');
      closeCreateQuizModal();
      // 퀴즈 편집 페이지로 이동
      window.location.href = `/quiz/edit?quizId=${data.quizId}`;
    } else {
      alert(data.message || '퀴즈 생성에 실패했습니다.');
    }
  } catch (error) {
    console.error('퀴즈 생성 실패:', error);
    alert('퀴즈 생성 중 오류가 발생했습니다.');
  }
}

// 전역 함수로 등록
window.openCreateQuizModal = openCreateQuizModal;
window.closeCreateQuizModal = closeCreateQuizModal;
window.submitCreateQuiz = submitCreateQuiz;
window.handleQuizModalClick = handleQuizModalClick;
window.handleThumbnailPreview = handleThumbnailPreview;