/* ============================================
   XERDOWN — Download Page Logic
   Public download page for shared files
   ============================================ */

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

/**
 * Extract shareId from URL path /d/:shareId
 */
function getShareIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/^\/d\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

/**
 * Render file information card
 */
function renderFileInfo(file, shareId) {
  const content = document.getElementById('download-content');
  if (!content) return;

  content.innerHTML = `
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
        <span>${file.download_count.toLocaleString()} download${file.download_count !== 1 ? 's' : ''}</span>
      </div>
      <div class="download-meta-item">
        ${icon('calendar')}
        <span>${formatDate(file.created_at)}</span>
      </div>
    </div>
    <div class="download-btn-wrapper">
      <button id="download-btn" class="btn btn-primary btn-lg" onclick="startDownload('${shareId}', '${escapeHtml(file.original_name)}')">
        ${icon('download')}
        Download File
      </button>
    </div>
    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
      Powered by Xerdown — Ultra-fast file hosting
    </p>
  `;
}

/**
 * Trigger file download
 */
function startDownload(shareId, filename) {
  const btn = document.getElementById('download-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Starting download...`;
  }

  // Create a temporary link to trigger the download
  const a = document.createElement('a');
  a.href = `/api/download/${shareId}`;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Reset button after a short delay
  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('download')} Download Again`;
    }
  }, 2000);
}

/**
 * Show loading state
 */
function showDownloadLoading() {
  const content = document.getElementById('download-content');
  if (!content) return;

  content.innerHTML = `
    <div class="loading-state">
      <div class="spinner spinner-lg"></div>
      <p>Loading file info...</p>
    </div>
  `;
}

/**
 * Show error state
 */
function showDownloadError(message) {
  const content = document.getElementById('download-content');
  if (!content) return;

  content.innerHTML = `
    <div class="download-file-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">
      ${icon('alertCircle')}
    </div>
    <h2 class="download-file-name" style="color: var(--danger);">File Not Found</h2>
    <div class="download-error">
      <p>${escapeHtml(message)}</p>
    </div>
    <div style="margin-top: 24px;">
      <a href="/" class="btn btn-secondary">
        ${icon('bolt')}
        Go to Xerdown
      </a>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
