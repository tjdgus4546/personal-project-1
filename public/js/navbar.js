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
                <a href="#" onclick="event.preventDefault(); openQuizInitModal();" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
                  퀴즈 만들기
                </a>
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
              <a href="#" onclick="event.preventDefault(); openQuizInitModal();" class="hover:text-blue-200 transition-colors text-sm lg:text-base whitespace-nowrap">
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