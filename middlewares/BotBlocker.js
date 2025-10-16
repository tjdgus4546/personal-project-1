// BotBlocker.js - 악의적인 봇 차단 미들웨어

// 알려진 해킹 도구 및 악의적인 봇 User-Agent 패턴
const MALICIOUS_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /acunetix/i,
  /netsparker/i,
  /metasploit/i,
  /burp/i,
  /havij/i,
  /w3af/i,
  /nessus/i,
  /openvas/i,
  /dirbuster/i,
  /gobuster/i,
  /wpscan/i,
  /joomla.*scanner/i,
  /drupal.*scanner/i,
  /wordpress.*scanner/i,
  /python-requests/i,  // 대부분 스크립트 봇
  /go-http-client/i,   // Go 기반 스캐너
  /zgrab/i,            // 대규모 스캐너
  /masscan/i,
  /paros/i,
  /zap/i,              // OWASP ZAP
  /arachni/i,
  /curl\/7\./i,        // curl 도구 (정상 사용도 있지만 의심)
  /wget/i,             // wget 도구
  /scanner/i,
  /bot.*scan/i,
  /security.*test/i,
  /penetration.*test/i,
  /vulnerability.*scanner/i
];

// 의심스러운 경로 패턴 (한국 웹사이트에서 절대 사용하지 않는 경로)
const SUSPICIOUS_PATHS = [
  // 중국/해외 특정 파일명
  /\/shouye\.html$/i,
  /\/mindex\.html$/i,
  /\/360\.html$/i,
  /\/ay-\d+\.html$/i,
  /\/code\d+\.html$/i,

  // 일반적인 스캐닝 경로
  /\/\d{3}\/index\.html$/i,  // /067/index.html 같은 패턴
  /\/admin\.php$/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/phpmyadmin/i,
  /\/mysql/i,
  /\/cgi-bin/i,
  /\/phpinfo\.php$/i,
  /\/test\.php$/i,
  /\/shell\.php$/i,
  /\/upload\.php$/i,
  /\/config\.php$/i,
  /\/\.env$/i,
  /\/\.git/i,
  /\/\.svn/i,
  /\/backup/i,
  /\/admin\/login/i,
  /\/adminer/i,
  /\/xmlrpc\.php$/i,

  // SQL Injection 시도
  /union.*select/i,
  /concat.*char/i,
  /'.*or.*1=1/i,

  // Path Traversal 시도
  /\.\.[\/\\]/,
  /etc[\/\\]passwd/i,
  /windows[\/\\]system32/i
];

// 404 추적을 위한 메모리 캐시 (IP별 404 카운트)
const notFoundTracker = new Map();

// 정리 주기 (10분마다 오래된 기록 삭제)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of notFoundTracker.entries()) {
    // 10분 이상 활동이 없으면 삭제
    if (now - data.lastAttempt > 10 * 60 * 1000) {
      notFoundTracker.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// IP 추출 헬퍼 함수
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
}

// 악의적인 User-Agent 확인
function isMaliciousUserAgent(userAgent) {
  if (!userAgent) return false;
  return MALICIOUS_USER_AGENTS.some(pattern => pattern.test(userAgent));
}

// 의심스러운 경로 확인
function isSuspiciousPath(path) {
  return SUSPICIOUS_PATHS.some(pattern => pattern.test(path));
}

// IP 차단 (블랙리스트에 추가)
async function blockIP(userDb, ip, reason, details = '', expiresIn = null) {
  try {
    const BlockedIP = require('../models/BlockedIP')(userDb);

    const blockData = {
      ip,
      reason,
      details,
      blockedAt: new Date(),
      isActive: true,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null
    };

    // 이미 차단된 IP면 업데이트, 없으면 생성
    await BlockedIP.findOneAndUpdate(
      { ip },
      blockData,
      { upsert: true, new: true }
    );

    console.log(`🚫 IP 차단: ${ip} (사유: ${reason})`);
  } catch (err) {
    console.error('IP 차단 실패:', err);
  }
}

// 404 추적 및 자동 차단
function track404(req, ip, userDb) {
  if (!notFoundTracker.has(ip)) {
    notFoundTracker.set(ip, {
      count: 1,
      lastAttempt: Date.now(),
      paths: [req.path]
    });
  } else {
    const data = notFoundTracker.get(ip);
    data.count++;
    data.lastAttempt = Date.now();
    data.paths.push(req.path);

    // 5분 내에 10번 이상 404 발생 시 자동 차단
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (data.count >= 10 && data.lastAttempt > fiveMinutesAgo) {
      blockIP(
        userDb,
        ip,
        'repeated_404',
        `5분 내 ${data.count}회 404 에러 발생`,
        24 * 60 * 60 * 1000  // 24시간 임시 차단
      );
      console.warn(`⚠️ 반복된 404 감지: ${ip} (${data.count}회)`);
    }
  }
}

// 봇 차단 미들웨어
function botBlocker(userDb) {
  const BlockedIP = require('../models/BlockedIP')(userDb);

  return async (req, res, next) => {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const path = req.path;

    try {
      // 1. 블랙리스트 확인 (가장 먼저 체크)
      const blocked = await BlockedIP.findOne({
        ip,
        isActive: true,
        $or: [
          { expiresAt: null },  // 영구 차단
          { expiresAt: { $gt: new Date() } }  // 만료 전 임시 차단
        ]
      });

      if (blocked) {
        console.warn(`🚫 차단된 IP 접근 시도: ${ip} (사유: ${blocked.reason})`);
        return res.status(403).json({
          message: '접근이 차단되었습니다.',
          reason: 'blocked_ip'
        });
      }

      // 2. 악의적인 User-Agent 확인
      if (isMaliciousUserAgent(userAgent)) {
        await blockIP(
          userDb,
          ip,
          'malicious_user_agent',
          `User-Agent: ${userAgent}`,
          7 * 24 * 60 * 60 * 1000  // 7일 차단
        );
        console.warn(`🚫 악의적인 User-Agent 감지: ${ip} - ${userAgent}`);
        return res.status(403).json({
          message: '접근이 거부되었습니다.',
          reason: 'malicious_user_agent'
        });
      }

      // 3. 의심스러운 경로 확인
      if (isSuspiciousPath(path)) {
        await blockIP(
          userDb,
          ip,
          'suspicious_path',
          `경로: ${path}`,
          3 * 24 * 60 * 60 * 1000  // 3일 차단
        );
        console.warn(`🚫 의심스러운 경로 접근: ${ip} - ${path}`);
        return res.status(403).json({
          message: '접근이 거부되었습니다.',
          reason: 'suspicious_path'
        });
      }

      // 4. 응답이 끝난 후 404 추적 (404가 너무 많으면 차단)
      res.on('finish', () => {
        if (res.statusCode === 404) {
          track404(req, ip, userDb);
        }
      });

      next();
    } catch (err) {
      console.error('Bot blocker 에러:', err);
      // 에러가 나도 서비스는 계속 진행
      next();
    }
  };
}

module.exports = botBlocker;
