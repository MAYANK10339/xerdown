/* ==========================================================
   XERDOWN — Public High-Speed Download Engine
   Supports: Instant Direct Download & Custom Security Countdown.
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

  const timerSeconds = parseInt(file.download_timer, 10) || 0;

  if (timerSeconds > 0) {
    // Custom Countdown Security Screen
    renderCountdownDownload(file, shareId, content, timerSeconds);
  } else {
    // Direct Instant Download Screen (0s delay)
    renderDirectDownload(file, shareId, content);
  }
}

/**
 * Direct Instant Download (0s Delay / Zero Waiting)
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
        Instant Download File
      </button>
    </div>
    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 14px;">
      Direct line-speed transfer powered by Xerdown Infrastructure
    </p>
  `;
}

/**
 * Custom Security Countdown Delay (User-Configured Seconds)
 */
function renderCountdownDownload(file, shareId, container, initialSeconds) {
  let secondsLeft = initialSeconds;

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

    <!-- Liquid Countdown Timer -->
    <div class="countdown-wrapper" style="margin-top: 10px;">
      <div class="countdown-circle">
        <span id="countdown-number">${secondsLeft}</span>
      </div>
      <p id="countdown-status" class="countdown-status">Generating verified download stream...</p>
    </div>

    <div class="download-btn-wrapper" style="margin-top: 18px;">
      <button id="download-btn" class="btn btn-primary btn-lg" disabled style="opacity: 0.5; cursor: not-allowed;">
        <span class="spinner"></span> Please wait ${secondsLeft}s
      </button>
    </div>

    <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 14px;">
      High-bandwidth line streaming unlocks automatically
    </p>
  `;

  const countdownEl = document.getElementById('countdown-number');
  const statusEl = document.getElementById('countdown-status');
  const btnEl = document.getElementById('download-btn');

  countdownTimer = setInterval(() => {
    secondsLeft--;
    if (countdownEl) countdownEl.textContent = secondsLeft;
    if (btnEl) btnEl.innerHTML = `<span class="spinner"></span> Please wait ${secondsLeft}s`;

    if (secondsLeft <= 0) {
      clearInterval(countdownTimer);

      if (countdownEl) countdownEl.textContent = '✓';
      if (statusEl) {
        statusEl.textContent = 'Download ready! Click below to begin.';
        statusEl.style.color = 'var(--accent)';
      }

      if (btnEl) {
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
        btnEl.style.cursor = 'pointer';
        btnEl.innerHTML = `${icon('download')} Download File Now`;
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
