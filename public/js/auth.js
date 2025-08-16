
// 401 에러 시 자동으로 토큰 재발급을 시도하는 fetch 래퍼 함수
async function fetchWithAuth(url, options = {}) {
    // 모든 인증 요청에 credentials 포함
    options.credentials = 'include';

    let response = await fetch(url, options);

    // 액세스 토큰 만료 시 (401 Unauthorized)
    if (response.status === 401) {
        console.log('액세스 토큰 만료. 재발급을 시도합니다.');

        // 새로운 토큰을 요청
        const refreshResponse = await fetch('/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });

        // 토큰 재발급 성공 시
        if (refreshResponse.ok) {
            console.log('토큰 재발급 성공. 원래 요청을 재시도합니다.');
            // 원래 요청을 새로운 토큰으로 재시도
            response = await fetch(url, options);
        } else {
            console.log('리프레시 토큰 만료. 로그아웃 처리합니다.');
            // 재발급 실패 시 (리프레시 토큰도 만료됨)
            // 호출한 쪽에서 이 응답을 받아 로그아웃 처리 등을 할 수 있도록 실패 응답을 그대로 반환
            return refreshResponse;
        }
    }

    return response;
}

// 사용자 정보를 가져오는 전용 함수
async function getUserData() {
    try {
        const response = await fetchWithAuth('/my-info');
        if (response.ok) {
            const user = await response.json();
            return user && user.username ? user : null;
        }
        return null;
    } catch (err) {
        console.error('유저 정보 불러오기 실패:', err);
        return null;
    }
}

export { getUserData, fetchWithAuth };