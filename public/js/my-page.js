// js/my-page.js

import { renderNavbar, getUserData, highlightCurrentPage } from './navbar.js';

// 사용자 정보 불러오기 및 표시
async function loadUserProfile() {
    const loadingSection = document.getElementById('loadingSection');
    const userInfoSection = document.getElementById('userInfoSection');
    const errorSection = document.getElementById('errorSection');

    try {
        // 사용자 기본 정보 가져오기
        const response = await fetch('/auth/me', {
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                // 로그인이 필요한 경우
                window.location.href = '/login?message=' + encodeURIComponent('로그인이 필요합니다.');
                return;
            }
            throw new Error('사용자 정보를 불러올 수 없습니다.');
        }

        const user = await response.json();
        
        // 추가 통계 정보 가져오기
        const statsResponse = await fetch('/api/user/stats', {
            credentials: 'include'
        });
        
        let stats = { createdQuizzes: 0, playedQuizzes: 0 };
        if (statsResponse.ok) {
            stats = await statsResponse.json();
        }

        // UI 업데이트
        displayUserInfo(user, stats);
        
        // 섹션 전환
        loadingSection.classList.add('hidden');
        userInfoSection.classList.remove('hidden');

    } catch (error) {
        console.error('사용자 정보 로딩 실패:', error);
        
        // 오류 섹션 표시
        loadingSection.classList.add('hidden');
        errorSection.classList.remove('hidden');
    }
}

// 사용자 정보 화면에 표시
function displayUserInfo(user, stats) {
    // 프로필 이미지 설정 (navbar와 동일한 방식)
    const profileContainer = document.getElementById('profileImageContainer');
    const displayName = user.nickname || user.username;
    
    // 네이버 기본 이미지가 아니고 실제 프로필 이미지가 있는 경우
    if (user.profileImage && user.profileImage !== 'https://ssl.pstatic.net/static/pwe/address/img_profile.png') {
        profileContainer.innerHTML = `
            <img 
                src="${user.profileImage}" 
                alt="${displayName}님의 프로필" 
                class="w-full h-full rounded-full object-cover"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            >
            <div class="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold" style="display: none;">
                ${displayName.charAt(0).toUpperCase()}
            </div>
        `;
    } else {
        // 기본 이미지이거나 이미지가 없는 경우 - 이니셜 아바타 사용
        profileContainer.innerHTML = `
            <div class="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                ${displayName.charAt(0).toUpperCase()}
            </div>
        `;
    }

    // 기본 정보 표시
    document.getElementById('displayNickname').textContent = user.nickname || user.username;
    document.getElementById('displayEmail').textContent = user.email;
    
    // 가입일 표시
    if (user.createdAt) {
        const joinDate = new Date(user.createdAt).toLocaleDateString('ko-KR');
        document.getElementById('joinDate').textContent = `가입일: ${joinDate}`;
    }

    // 상세 정보 표시
    document.getElementById('displayUsername').textContent = user.username || '-';
    document.getElementById('displayNicknameDetail').textContent = user.nickname || '-';
    document.getElementById('displayEmailDetail').textContent = user.email || '-';

    // 활동 통계 표시
    document.getElementById('playedQuizzesCount').textContent = `${stats.playedQuizzes || 0}개`;
    document.getElementById('createdQuizzesCount').textContent = `${stats.createdQuizzes || 0}개`;
    
    // 가입 방법 표시
    const signupMethod = user.naverId ? '네이버 연동' : '일반 가입';
    document.getElementById('signupMethod').textContent = signupMethod;
}

// 내 정보 수정 페이지로 이동
function goToEditProfile() {
    // 나중에 구현할 수정 페이지로 이동
    window.location.href = '/edit-profile';
}

// 이벤트 리스너 설정
function setupEventListeners() {
    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', goToEditProfile);
    }
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
        
        // 이벤트 리스너 설정
        setupEventListeners();
        
        // 사용자 정보 로드
        await loadUserProfile();
        
    } catch (error) {
        console.error('페이지 초기화 실패:', error);
        
        // 오류 섹션 표시
        document.getElementById('loadingSection').classList.add('hidden');
        document.getElementById('errorSection').classList.remove('hidden');
    }
}

// 페이지 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);