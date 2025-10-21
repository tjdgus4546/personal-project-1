// 모바일 광고 렌더링 함수
export async function renderMobileAd() {
    const adHTML = `
        <div class="mobile-only-ad">
            <div class="flex justify-center">
                <ins class="kakao_ad_area" style="display:none;"
                data-ad-unit = "DAN-d5NeUbk8NbihkGZm"
                data-ad-width = "320"
                data-ad-height = "100"></ins>
            </div>
        </div>
    `;

    // body 맨 앞에 삽입 (navbar 다음)
    document.body.insertAdjacentHTML('afterbegin', adHTML);

    // 카카오 애드핏 스크립트 재실행
    // 동적으로 추가된 광고 영역도 렌더링되도록 강제 실행
    try {
        if (window.adfit) {
            window.adfit.render();
        }
    } catch (error) {
        // 광고 로드 실패는 조용히 무시 (사용자 경험에 영향 없음)
        console.debug('Ad render skipped:', error);
    }
}
