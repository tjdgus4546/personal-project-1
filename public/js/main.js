// js/main.js

import { renderNavbar, getUserData, highlightCurrentPage } from './navbar.js';

// 초대 코드로 게임 참여
async function joinByInvite() {
    const code = document.getElementById('inviteInput').value.trim();
    if (!code) {
        alert('초대 코드를 입력하세요');
        return;
    }

    try {
        const response = await fetch('/game/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: JSON.stringify({ inviteCode: code }),
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            window.location.href = `/quiz/${result.sessionId}`;
        } else {
            alert(result.message || '입장에 실패했습니다. 코드를 다시 확인해주세요.');
        }
    } catch (err) {
        console.error('Join session error:', err);
        alert('입장 중 오류가 발생했습니다.');
    }
}

// 페이지 UI 업데이트
function updatePageUI(user) {
    const inviteSection = document.getElementById('inviteSection');
    const loginPrompt = document.getElementById('loginPrompt');

    if (user) {
        // 로그인 상태
        inviteSection.classList.remove('hidden');
        loginPrompt.classList.add('hidden');
    } else {
        // 로그아웃 상태
        inviteSection.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
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
        console.log('페이지 초기화 시작');
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

// 페이지 로드 완료 시 초기화
document.addEventListener('DOMContentLoaded', initializePage);