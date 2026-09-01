/* ==========================================================
   XERDOWN — Public Download Engine with 10s Sponsor Gateway
   ========================================================== */

let countdownTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initDownloadPage();
});

async function initDownloadPage() {
  const shareId = getShareIdFromUrl();

  if (!shareId) {
    showDownloadError('Invalid download link.');
    return;
  }

  try {
    showDownloadLoading();

    const res = await fetch(`/api/download/${shareId}/info`);
    const data = await res.json();

    if (!res.ok) {
      showDownloadError(data.error || 'File not found or link has expired.');
      return;
    }

    renderFileInfo(data.file, shareId);
  } catch (err) {
    showDownloadError('Could not connect to server. Please try again.');
  }
}

function getShareIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/d\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function renderFileInfo(file, shareId) {
  const content = document.getElementById('download-content');
  if (!content) return;

  if (file.is_monetized) {
    // 10-Second Sponsor Gateway Screen
    renderMonetizedGateway(file, shareId, content);
  } else {
    // Direct Instant Download Screen
    renderDirectDownload(file, shareId, content);
  }
}

/**
 * Direct Instant Download (Zero Waiting)
 */
function renderDirectDownload(file, shareId, container) {
  container.innerHTML = `
    <div class="download-file-icon">
      ${fileTypeIcon(file.mime_type)}
    </div>
    <h2 class="download-file-name">${escapeHtml(file.original_name)}</h2>
    <div class="download-meta">
      <div class="download-meta-item">
        ${icon('storage')}
        <span>${formatBytes(file.size)}</span>
      </div>
      <div class="download-meta-item">
        ${icon('download')}
        <span>${file.download_count.toLocaleString()} downloads</span>
      </div>
      <div class="download-meta-item">
        ${icon('calendar')}
        <span>${formatDate(file.created_at)}</span>
      </div>
    </div>
    <div class="download-btn-wrapper">
      <button id="download-btn" class="btn btn-primary btn-lg" onclick="startDownload('${shareId}', '${escapeHtml(file.original_name)}')">
        ${icon('download')}
        Direct Download File
      </button>
    </div>
    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 14px;">
      Direct line-speed transfer powered by Xerdown Infrastructure
    </p>
  `;
}

/**
 * 10-Second Sponsor Gateway with Real-time Circular Countdown & Earnings Credit
 */
function renderMonetizedGateway(file, shareId, container) {
  let secondsLeft = file.ad_timer || 10;

  container.innerHTML = `
    <div class="download-file-icon">
      ${fileTypeIcon(file.mime_type)}
    </div>
    <h2 class="download-file-name">${escapeHtml(file.original_name)}</h2>
    
    <div class="download-meta">
      <div class="download-meta-item">
        ${icon('storage')}
        <span>${formatBytes(file.size)}</span>
      </div>
      <div class="download-meta-item">
        ${icon('download')}
        <span>${file.download_count.toLocaleString()} downloads</span>
      </div>
    </div>

    <!-- Sponsor / Ad Banner Slot -->
    <div class="sponsor-gateway-card">
      <div class="sponsor-badge">Verified Sponsor Gateway</div>
      <div class="sponsor-content">
        <h4>High-Speed Cloud Distribution</h4>
        <p>Your secure download link is being generated through high-bandwidth line servers.</p>
      </div>
    </div>

    <!-- Liquid Countdown Timer -->
    <div class="countdown-wrapper">
      <div class="countdown-circle">
        <span id="countdown-number">${secondsLeft}</span>
      </div>
      <p id="countdown-status" class="countdown-status">Generating secure download link...</p>
    </div>

    <div class="download-btn-wrapper">
      <button id="download-btn" class="btn btn-primary btn-lg" disabled style="opacity: 0.5; cursor: not-allowed;">
        <span class="spinner"></span> Please wait ${secondsLeft}s
      </button>
    </div>

    <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 12px;">
      Creator support enabled · Download unlocks automatically
    </p>
  `;

  // Start 10-Second Timer
  const countdownEl = document.getElementById('countdown-number');
  const statusEl = document.getElementById('countdown-status');
  const btnEl = document.getElementById('download-btn');

  countdownTimer = setInterval(async () => {
    secondsLeft--;
    if (countdownEl) countdownEl.textContent = secondsLeft;
    if (btnEl) btnEl.innerHTML = `<span class="spinner"></span> Please wait ${secondsLeft}s`;

    if (secondsLeft <= 0) {
      clearInterval(countdownTimer);

      // Credit creator's UPI wallet balance
      try {
        fetch(`/api/download/${shareId}/credit`, { method: 'POST' });
      } catch (e) {}

      if (countdownEl) countdownEl.textContent = '✓';
      if (statusEl) {
        statusEl.textContent = 'Link generated! Click below to download.';
        statusEl.style.color = 'var(--accent)';
      }

      if (btnEl) {
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        btnEl.style.cursor = 'pointer';
        btnEl.innerHTML = `${icon('download')} Unlock & Download File`;
        btnEl.onclick = () => startDownload(shareId, file.original_name);
      }
    }
  }, 1000);
}

function startDownload(shareId, filename) {
  const btn = document.getElementById('download-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Starting download...`;
  }

  const a = document.createElement('a');
  a.href = `/api/download/${shareId}`;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('download')} Download Again`;
    }
  }, 2000);
}

function showDownloadLoading() {
  const content = document.getElementById('download-content');
  if (!content) return;

  content.innerHTML = `
    <div class="loading-state">
      <div class="spinner spinner-lg"></div>
      <p style="margin-top: 14px; font-weight: 600; color: var(--text-secondary);">Verifying file availability...</p>
    </div>
  `;
}

function showDownloadError(message) {
  const content = document.getElementById('download-content');
  if (!content) return;

  content.innerHTML = `
    <div class="download-file-icon" style="background: rgba(255, 51, 102, 0.1); color: var(--danger);">
      ${icon('alertCircle')}
    </div>
    <h2 class="download-file-name" style="color: var(--danger);">File Unavailable</h2>
    <div class="download-error">
      <p style="color: var(--text-secondary); margin-bottom: 20px;">${escapeHtml(message)}</p>
    </div>
    <div>
      <a href="/" class="btn btn-secondary">
        ${icon('bolt')}
        Go to Xerdown
      </a>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
