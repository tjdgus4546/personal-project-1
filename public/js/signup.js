// public/js/signup.js

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', function() {
    // URL 파라미터 처리
    handleUrlParameters();
    
    // 회원가입 폼 이벤트 리스너
    setupSignupForm();
});

// URL 파라미터에서 에러/성공 메시지 처리
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const provider = urlParams.get('provider');
    const message = urlParams.get('message');
    
    // 성공 메시지 처리
    if (message) {
        showAlert('success', decodeURIComponent(message));
        return;
    }
    
    // 에러 메시지 처리
    if (error) {
        let errorMessage = '';
        
        switch(error) {
            case 'email_exists':
                if (provider === 'naver') {
                    errorMessage = '해당 이메일은 이미 다른 방법으로 가입된 계정입니다. <a href="/login">로그인</a>을 시도하거나 다른 이메일을 사용해주세요.';
                } else {
                    errorMessage = '이미 가입된 이메일입니다. <a href="/login">로그인</a>을 시도해주세요.';
                }
                break;
            case 'auth_failed':
                errorMessage = '회원가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.';
                break;
            case 'invalid_data':
                errorMessage = '입력한 정보가 올바르지 않습니다. 다시 확인해주세요.';
                break;
            default:
                errorMessage = '알 수 없는 오류가 발생했습니다.';
        }
        
        showAlert('error', errorMessage);
    }
}

// 알림 메시지 표시 함수
function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'info' ? 'alert-info' : 'alert-error';
    
    alertContainer.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
    
    // 성공 메시지는 3초 후 자동 제거
    if (type === 'success') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 3000);
    }
}

// 회원가입 폼 설정
function setupSignupForm() {
    const signupForm = document.getElementById('signupForm');
    
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // 로딩 상태 시작
        setLoadingState(true);
        
        try {
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            // 유효성 검사
            if (!validateSignupForm(data)) {
                setLoadingState(false);
                return;
            }
            
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // 회원가입 성공
                showAlert('success', '회원가입이 완료되었습니다! 로그인 페이지로 이동합니다...');
                
                // 2초 후 로그인 페이지로 리다이렉트
                setTimeout(() => {
                    window.location.href = '/login?message=' + encodeURIComponent('회원가입이 완료되었습니다. 로그인해주세요.');
                }, 2000);
                
            } else {
                // 회원가입 실패
                showAlert('error', result.message || '회원가입에 실패했습니다.');
                setLoadingState(false);
            }
            
        } catch (err) {
            console.error('회원가입 에러:', err);
            showAlert('error', '네트워크 오류가 발생했습니다. 다시 시도해주세요.');
            setLoadingState(false);
        }
    });
}

// 폼 유효성 검사
function validateSignupForm(data) {
    // 닉네임 검사
    if (!data.nickname || !data.nickname.trim()) {
        showAlert('error', '닉네임을 입력해주세요.');
        return false;
    }
    
    if (data.nickname.trim().length < 2) {
        showAlert('error', '닉네임은 2글자 이상이어야 합니다.');
        return false;
    }
    
    if (data.nickname.trim().length > 20) {
        showAlert('error', '닉네임은 20글자 이하여야 합니다.');
        return false;
    }
    
    // 이름 검사
    if (!data.username || !data.username.trim()) {
        showAlert('error', '이름을 입력해주세요.');
        return false;
    }
    
    if (data.username.trim().length < 2) {
        showAlert('error', '이름은 2글자 이상이어야 합니다.');
        return false;
    }
    
    if (data.username.trim().length > 20) {
        showAlert('error', '이름은 20글자 이하여야 합니다.');
        return false;
    }
    
    // 이메일 검사
    if (!data.email || !data.email.trim()) {
        showAlert('error', '이메일을 입력해주세요.');
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        showAlert('error', '올바른 이메일 형식을 입력해주세요.');
        return false;
    }
    
    // 비밀번호 검사
    if (!data.password || !data.password.trim()) {
        showAlert('error', '비밀번호를 입력해주세요.');
        return false;
    }
    
    if (data.password.length < 6) {
        showAlert('error', '비밀번호는 6글자 이상이어야 합니다.');
        return false;
    }
    
    if (data.password.length > 30) {
        showAlert('error', '비밀번호는 30글자 이하여야 합니다.');
        return false;
    }
    
    return true;
}

// 로딩 상태 관리
function setLoadingState(loading) {
    const form = document.getElementById('signupForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const socialButtons = document.querySelectorAll('.social-login-group a');
    
    if (loading) {
        form.classList.add('loading');
        submitButton.disabled = true;
        submitButton.textContent = '가입 중...';
        
        // 소셜 로그인 버튼도 비활성화
        socialButtons.forEach(btn => {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
        });
    } else {
        form.classList.remove('loading');
        submitButton.disabled = false;
        submitButton.textContent = '가입하기';
        
        // 소셜 로그인 버튼 재활성화
        socialButtons.forEach(btn => {
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        });
    }
}

// 실시간 유효성 검사 (선택사항)
document.addEventListener('DOMContentLoaded', function() {
    const nicknameInput = document.getElementById('nickname');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    
    // 닉네임 실시간 검사
    if (nicknameInput) {
        nicknameInput.addEventListener('blur', function() {
            const nickname = this.value.trim();
            if (nickname && nickname.length < 2) {
                this.style.borderColor = '#ff4444';
            } else {
                this.style.borderColor = '#ddd';
            }
        });
    }
    
    // 이름 실시간 검사
    if (usernameInput) {
        usernameInput.addEventListener('blur', function() {
            const username = this.value.trim();
            if (username && username.length < 2) {
                this.style.borderColor = '#ff4444';
            } else {
                this.style.borderColor = '#ddd';
            }
        });
    }
    
    // 이메일 실시간 검사
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            const email = this.value.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                this.style.borderColor = '#ff4444';
            } else {
                this.style.borderColor = '#ddd';
            }
        });
    }
    
    // 비밀번호 실시간 검사
    if (passwordInput) {
        passwordInput.addEventListener('blur', function() {
            const password = this.value;
            if (password && password.length < 6) {
                this.style.borderColor = '#ff4444';
            } else {
                this.style.borderColor = '#ddd';
            }
        });
    }
    
    // 입력 필드 포커스 시 테두리 색상 초기화
    [nicknameInput, usernameInput, emailInput, passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('focus', function() {
                this.style.borderColor = '#4CAF50';
            });
        }
    });
});