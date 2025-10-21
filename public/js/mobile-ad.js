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
}
