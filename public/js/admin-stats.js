// public/js/admin-stats.js

document.addEventListener('DOMContentLoaded', function() {
  loadStats();
  loadDebugInfo();
});

async function loadStats() {
  const loadingState = document.getElementById('loadingState');
  const statsContent = document.getElementById('statsContent');

  try {
    const response = await fetch('/admin/stats', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('통계를 불러오는데 실패했습니다.');
    }

    const data = await response.json();

    if (data.success) {
      displayStats(data.stats);
      loadingState.classList.add('hidden');
      statsContent.classList.remove('hidden');
    } else {
      throw new Error(data.message || '통계를 불러오는데 실패했습니다.');
    }

  } catch (error) {
    console.error('Stats load error:', error);
    loadingState.innerHTML = `
      <div class="text-center py-20">
        <svg class="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-gray-400 text-lg mb-4">${error.message}</p>
        <button onclick="location.reload()" class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors">
          다시 시도
        </button>
      </div>
    `;
  }
}

async function loadDebugInfo() {
  try {
    const response = await fetch('/admin/stats/debug-ips', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('디버그 정보를 불러오는데 실패했습니다.');
    }

    const data = await response.json();

    if (data.success) {
      displayDebugInfo(data);
    } else {
      throw new Error(data.message || '디버그 정보를 불러오는데 실패했습니다.');
    }

  } catch (error) {
    console.error('Debug info load error:', error);
    document.getElementById('debugIpList').textContent = '디버그 정보를 불러오는데 실패했습니다.';
    document.getElementById('debugRecentLogs').innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-red-400 py-4">
          디버그 정보를 불러오는데 실패했습니다.
        </td>
      </tr>
    `;
  }
}

function displayStats(stats) {
  // 주요 지표
  document.getElementById('onlineUsers').textContent = stats.online || 0;
  document.getElementById('dailyVisitors').textContent = stats.daily.visitors || 0;
  document.getElementById('weeklyVisitors').textContent = stats.weekly.visitors || 0;
  document.getElementById('monthlyVisitors').textContent = stats.monthly.visitors || 0;

  // 페이지뷰
  document.getElementById('dailyPageviews').textContent = (stats.daily.pageviews || 0).toLocaleString();
  document.getElementById('weeklyPageviews').textContent = (stats.weekly.pageviews || 0).toLocaleString();
  document.getElementById('monthlyPageviews').textContent = (stats.monthly.pageviews || 0).toLocaleString();

  // 시간대별 통계
  displayHourlyStats(stats.hourlyStats);

  // 일별 통계
  displayDailyStats(stats.dailyStats);
}

function displayHourlyStats(hourlyStats) {
  const table = document.getElementById('hourlyStatsTable');

  if (!hourlyStats || hourlyStats.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-gray-500 py-8">
          아직 데이터가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  // 0-23시까지 모든 시간대 표시 (데이터 없으면 0으로)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const statsMap = new Map(hourlyStats.map(s => [s.hour, s]));

  table.innerHTML = hours.map(hour => {
    const stat = statsMap.get(hour) || { visitors: 0, pageviews: 0 };
    const isCurrentHour = new Date().getHours() === hour;
    const rowClass = isCurrentHour ? 'bg-blue-900/30' : '';

    return `
      <tr class="border-b border-gray-700 ${rowClass}">
        <td class="p-2 text-gray-300">
          ${String(hour).padStart(2, '0')}:00
          ${isCurrentHour ? '<span class="text-xs text-blue-400 ml-2">(현재)</span>' : ''}
        </td>
        <td class="p-2 text-right text-gray-200">${stat.visitors || 0}명</td>
        <td class="p-2 text-right text-gray-200">${stat.pageviews || 0}회</td>
      </tr>
    `;
  }).join('');
}

function displayDailyStats(dailyStats) {
  const table = document.getElementById('dailyStatsTable');

  if (!dailyStats || dailyStats.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-gray-500 py-8">
          아직 데이터가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  // 최근 7일 채우기 (데이터 없는 날은 0으로)
  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const statsMap = new Map(
    dailyStats.map(s => [
      new Date(s.date).toDateString(),
      s
    ])
  );

  table.innerHTML = last7Days.map(date => {
    const dateStr = date.toDateString();
    const stat = statsMap.get(dateStr) || { visitors: 0, pageviews: 0 };
    const isToday = date.toDateString() === today.toDateString();
    const rowClass = isToday ? 'bg-blue-900/30' : '';

    return `
      <tr class="border-b border-gray-700 ${rowClass}">
        <td class="p-2 text-gray-300">
          ${formatDate(date)}
          ${isToday ? '<span class="text-xs text-blue-400 ml-2">(오늘)</span>' : ''}
        </td>
        <td class="p-2 text-right text-gray-200">${stat.visitors || 0}명</td>
        <td class="p-2 text-right text-gray-200">${stat.pageviews || 0}회</td>
      </tr>
    `;
  }).join('');
}

function formatDate(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[date.getDay()];

  return `${month}월 ${day}일 (${weekday})`;
}

function displayDebugInfo(data) {
  // 고유 IP 개수 표시 (실제 사용자 vs 전체)
  const countText = `${data.uniqueIpCountReal || 0} 명 (봇 제외)`;
  const allCountText = `전체 ${data.uniqueIpCount || 0}명 (봇 포함)`;

  document.getElementById('debugUniqueIpCount').innerHTML = `
    ${countText}
    <div class="text-sm font-normal text-gray-400 mt-1">${allCountText}</div>
  `;

  // 고유 IP 목록 표시 (실제 사용자만)
  const ipListEl = document.getElementById('debugIpList');
  if (data.uniqueIpsReal && data.uniqueIpsReal.length > 0) {
    ipListEl.innerHTML = `
      <div class="text-green-400 text-xs mb-2">✓ 실제 사용자 IP (${data.uniqueIpsReal.length}개)</div>
      ${data.uniqueIpsReal.map((ip, index) =>
        `<div class="mb-1 text-green-300">${index + 1}. ${ip}</div>`
      ).join('')}
      ${data.uniqueIps.length > data.uniqueIpsReal.length ? `
        <div class="text-red-400 text-xs mt-3 mb-2">⚠ 봇 IP (${data.uniqueIps.length - data.uniqueIpsReal.length}개)</div>
        ${data.uniqueIps.filter(ip => !data.uniqueIpsReal.includes(ip)).map((ip, index) =>
          `<div class="mb-1 text-red-300">${index + 1}. ${ip}</div>`
        ).join('')}
      ` : ''}
    `;
  } else {
    ipListEl.textContent = '수집된 실제 사용자 IP가 없습니다.';
  }

  // 최근 로그 표시 (봇 여부 표시)
  const logsTable = document.getElementById('debugRecentLogs');
  if (data.recentLogs && data.recentLogs.length > 0) {
    logsTable.innerHTML = data.recentLogs.map(log => {
      const date = new Date(log.timestamp);
      const timeStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

      const botBadge = log.isBot ? '<span class="text-xs bg-red-500/30 text-red-300 px-2 py-0.5 rounded ml-2">BOT</span>' : '<span class="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded ml-2">USER</span>';
      const rowClass = log.isBot ? 'bg-red-900/10' : '';

      return `
        <tr class="border-b border-gray-700 ${rowClass}">
          <td class="p-2 text-gray-300">${log.ip}${botBadge}</td>
          <td class="p-2 text-gray-300">${log.path}</td>
          <td class="p-2 text-gray-400">${timeStr}</td>
        </tr>
      `;
    }).join('');
  } else {
    logsTable.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-gray-500 py-8">
          수집된 로그가 없습니다.
        </td>
      </tr>
    `;
  }
}
