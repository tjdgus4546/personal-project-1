// 정지 알림이 이미 표시되었는지 확인하는 플래그
let suspendAlertShownInFetch = false;

// fetchWithAuth를 export로 변경
export async function fetchWithAuth(url, options = {}) {
    options.credentials = 'include';

    try {
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
                throw new Error('Token refresh failed');
            }
        }

        // 403 에러인 경우 정지/탈퇴 여부 확인
        if (response.status === 403) {
            // 이미 alert를 표시했다면 중복 방지
            if (suspendAlertShownInFetch) {
                throw new Error('Already handled');
            }

            const data = await response.json();

            // 정지된 계정
            if (data.isSuspended) {
                suspendAlertShownInFetch = true; // 플래그 설정

                const suspendMessage = data.suspendedUntil
                    ? `계정이 ${new Date(data.suspendedUntil).toLocaleDateString('ko-KR')}까지 정지되었습니다.`
                    : '계정이 영구 정지되었습니다.';

                // alert 표시 (동기적으로 사용자가 확인할 때까지 대기)
                alert(`${suspendMessage}\n\n사유: ${data.suspendReason || '관리자 조치'}`);

                // 로그아웃 처리
                await fetch('/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                });

                // 메인 페이지로 리다이렉트
                window.location.href = '/';
                throw new Error('Account suspended');
            }

            // 기타 403 에러 (탈퇴한 계정 등)
            if (data.message) {
                suspendAlertShownInFetch = true; // 플래그 설정

                // alert 표시
                alert(data.message);

                // 로그아웃 처리
                await fetch('/auth/logout', {
                    method: 'POST',
                    credentials: 'include'
                });

                // 메인 페이지로 리다이렉트
                window.location.href = '/';
                throw new Error('Access forbidden');
            }
        }

        return response;
    } catch (error) {
        console.error('fetchWithAuth 에러:', error);
        throw error;
    }
}

let quizInitTitleImageBase64 = null;

// 퀴즈 초기 설정 모달 열기
function openQuizInitModal() {
    const modal = document.getElementById('quizInitModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        // 입력 필드 초기화
        document.getElementById('quizInitTitle').value = '';
        document.getElementById('quizInitDescription').value = '';
        document.getElementById('quizInitTitleImageInput').value = '';
        document.getElementById('quizInitTitleImagePreview').style.display = 'none';
        document.getElementById('quizInitImagePreviewContainer').classList.add('hidden');
        quizInitTitleImageBase64 = null;
    }
}

// 퀴즈 초기 설정 모달 닫기
function closeQuizInitModal() {
    const modal = document.getElementById('quizInitModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

// 모달 외부 클릭 시 닫기
function handleQuizInitModalClick(event) {
    if (event.target.id === 'quizInitModal') {
        closeQuizInitModal();
    }
}

// 이미지 리사이즈 함수를 export로 변경
export async function resizeImageToBase64(file, maxKB = 240, minKB = 40) {
    return new Promise((resolve, reject) => {
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > 6) {
            return reject(new Error('6MB를 초과한 이미지는 업로드할 수 없습니다.'));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let quality = 0.9;
                let canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                function tryCompress() {
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    const sizeKB = (base64.length * 3) / 4 / 1024;

                    if (sizeKB <= maxKB || quality <= 0.1) {
                        if (sizeKB < minKB && quality < 0.9) {
                            quality = Math.min(0.9, quality + 0.1);
                            tryCompress();
                        } else {
                            resolve(base64);
                        }
                    } else {
                        quality -= 0.05;
                        tryCompress();
                    }
                }
                tryCompress();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 이미지 선택 핸들러
async function handleQuizInitImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        try {
            quizInitTitleImageBase64 = await resizeImageToBase64(file);
            const preview = document.getElementById('quizInitTitleImagePreview');
            const container = document.getElementById('quizInitImagePreviewContainer');
            
            preview.src = quizInitTitleImageBase64;
            preview.style.display = 'block';
            container.classList.remove('hidden');
        } catch (err) {
            alert('이미지 처리 실패: ' + err.message);
        }
    }
}

// 퀴즈 생성 함수
async function createQuizFromModal() {
    const title = document.getElementById('quizInitTitle').value.trim();
    const description = document.getElementById('quizInitDescription').value.trim();
    
    if (!title) {
        alert('퀴즈 제목을 입력하세요.');
        return;
    }

    if (!quizInitTitleImageBase64) {
        alert('대표 이미지를 업로드하세요.');
        return;
    }

    const createBtn = document.getElementById('quizInitCreateBtn');
    const originalText = createBtn.innerHTML;
    createBtn.disabled = true;
    createBtn.innerHTML = '<div class="inline-flex items-center"><svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>생성 중...</div>';

    try {
        const res = await fetchWithAuth('/api/quiz/init', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, description, titleImageBase64: quizInitTitleImageBase64 })
        });

        const data = await res.json();

        if (res.ok) {
            
            closeQuizInitModal();
            window.location.href = `/quiz/edit?quizId=${data.quizId}`;
        } else {
            console.error('퀴즈 생성 실패:', data.message);
            alert('퀴즈 생성 실패: ' + data.message);
        }
    } catch (error) {
        console.error('퀴즈 생성 오류:', error);
        console.error('오류 상세:', error.message);
        console.error('오류 스택:', error.stack);
        alert('퀴즈 생성 중 오류가 발생했습니다: ' + error.message);
    } finally {
        createBtn.disabled = false;
        createBtn.innerHTML = originalText;
    }
}

// 전역 함수로 등록
window.openQuizInitModal = openQuizInitModal;
window.closeQuizInitModal = closeQuizInitModal;
window.handleQuizInitModalClick = handleQuizInitModalClick;
window.handleQuizInitImageSelect = handleQuizInitImageSelect;
window.createQuizFromModal = createQuizFromModal;