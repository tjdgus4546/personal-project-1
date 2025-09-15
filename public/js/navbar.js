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

// 상단바 HTML 생성 함수
function createNavbarHTML(user = null) {
  return `
    <nav class="bg-[#222230] text-white shadow-lg">
      <div class="max-w-5xl mx-auto px-4 sm:px-6">
        <div class="flex justify-between items-center h-14 sm:h-16">
          <!-- 로고 및 데스크톱 메뉴 -->
          <div class="flex items-center">
            <a href="/" class="text-lg sm:text-xl font-bold hover:text-blue-200 transition-colors flex-shrink-0">
              QQ
            </a>
            
            ${user ? `
              <!-- 데스크톱 네비게이션 (768px 이상) -->
              <div class="hidden md:flex ml-6 lg:ml-8 space-x-4 lg:space-x-6">
                <a href="/quiz/my-list" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                  나의 퀴즈
                </a>
                <a href="/quiz/init" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                  퀴즈 만들기
                </a>
              </div>
            ` : ''}
          </div>
          
          <!-- 데스크톱 사용자 메뉴 -->
          <div class="hidden sm:flex items-center space-x-2 lg:space-x-4">
            ${user ? `
              <span class="text-xs lg:text-sm hidden md:block">
                안녕하세요, <span class="font-semibold">${user.username}</span>님
              </span>
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
                안녕하세요, <span class="font-semibold">${user.username}</span>님
              </div>
              
              <!-- 네비게이션 링크 -->
              <a href="/quiz/my-list" class="block px-2 py-2 hover:bg-gray-700 rounded-md transition-colors text-sm">
                나의 퀴즈
              </a>
              <a href="/quiz/init" class="block px-2 py-2 hover:bg-gray-700 rounded-md transition-colors text-sm">
                퀴즈 만들기
              </a>
              
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
      // 햄버거 아이콘을 X 아이콘으로 변경
      mobileMenuBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      `;
    } else {
      mobileMenu.classList.add('hidden');
      mobileMenuBtn.setAttribute('aria-label', '메뉴 열기');
      // X 아이콘을 햄버거 아이콘으로 변경
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
      
      // 현재 페이지가 로그인이 필요한 페이지인지 확인
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
}

// 메인 상단바 렌더링 함수 (외부에서 호출)
export async function renderNavbar() {
  try {
    // 사용자 정보 가져오기
    const user = await getUserData();
    
    // 기존 상단바 제거
    const existingNavbar = document.getElementById('navbar');
    if (existingNavbar) {
      existingNavbar.remove();
    }
    
    // 기존 이벤트 리스너 제거
    window.removeEventListener('resize', handleResize);
    
    // 새 상단바 생성 및 삽입
    const navbarHTML = createNavbarHTML(user);
    document.body.insertAdjacentHTML('afterbegin', `<div id="navbar">${navbarHTML}</div>`);
    
    // 이벤트 리스너 추가
    attachNavbarListeners();
    
    return user; // 다른 모듈에서 사용할 수 있도록 반환
    
  } catch (err) {
    console.error('상단바 렌더링 에러:', err);
    // 에러 발생 시 로그인 안된 상태로 렌더링
    const navbarHTML = createNavbarHTML();
    document.body.insertAdjacentHTML('afterbegin', `<div id="navbar">${navbarHTML}</div>`);
    attachNavbarListeners();
    return null;
  }
}

// 현재 페이지 하이라이트 함수
export function highlightCurrentPage() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('#navbar a');
  
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