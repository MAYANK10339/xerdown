/* ==========================================================
   XERDOWN — Dashboard Logic with Customizable Download Timers
   ========================================================== */

let currentUser = null;
let uploadEngine = null;

document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  currentUser = await requireAuth();
  if (!currentUser) return;

  const userDisplay = document.getElementById('navbar-username');
  if (userDisplay) {
    userDisplay.textContent = currentUser.username;
  }

  await Promise.all([loadStats(), loadFiles()]);
  initUpload();
  initDangerZone();
}

/* ------------------------------------------
   Stats
   ------------------------------------------ */
async function loadStats() {
  try {
    const res = await fetch('/api/files/stats', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    const elFiles = document.getElementById('stat-files');
    const elStorage = document.getElementById('stat-storage');
    const elDownloads = document.getElementById('stat-downloads');

    if (elFiles) elFiles.textContent = data.total_files.toLocaleString();
    if (elStorage) elStorage.textContent = formatBytes(data.total_size);
    if (elDownloads) elDownloads.textContent = data.total_downloads.toLocaleString();
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

/* ------------------------------------------
   Upload Zone with Configurable Timer
   ------------------------------------------ */
function initUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  const progressList = document.getElementById('upload-progress-list');

  uploadEngine = new UploadEngine({
    onFileStart(id, file, downloadTimer) {
      const item = createProgressItem(id, file, downloadTimer);
      progressList.prepend(item);
    },

    onFileProgress(id, data) {
      updateProgressItem(id, data);
    },

    onFileComplete(id, response, file) {
      markProgressComplete(id);
      showToast(`${truncateFilename(file.name, 30)} uploaded!`, 'success');
    },

    onFileError(id, error) {
      markProgressError(id, error);
      showToast(error, 'error');
    },

    async onComplete(completed, total) {
      if (completed > 0) {
        await Promise.all([loadStats(), loadFiles()]);
      }

      setTimeout(() => {
        const items = progressList.querySelectorAll('.upload-complete');
        items.forEach(item => {
          item.style.opacity = '0';
          item.style.transform = 'translateY(-10px)';
          item.style.transition = 'all 0.3s ease';
          setTimeout(() => item.remove(), 300);
        });
      }, 3000);
    }
  });

  initUploadZone(zone, input, (files, downloadTimer) => {
    uploadEngine.uploadFiles(files, downloadTimer);
  });
}

/* ------------------------------------------
   Files List & Timer Configuration
   ------------------------------------------ */
async function loadFiles() {
  try {
    const res = await fetch('/api/files', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    renderFiles(data.files);
  } catch (err) {
    console.error('Files load error:', err);
  }
}

function renderFiles(files) {
  const tbody = document.getElementById('files-tbody');
  const emptyState = document.getElementById('files-empty');
  const tableWrapper = document.getElementById('files-table-wrapper');
  const filesCount = document.getElementById('files-count');

  if (!tbody) return;

  if (filesCount) {
    filesCount.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
  }

  if (files.length === 0) {
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (tableWrapper) tableWrapper.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = files.map(file => {
    const timer = parseInt(file.download_timer, 10) || 0;
    const timerText = timer === 0 ? 'Instant (0s)' : `${timer}s Delay`;
    const isTimerActive = timer > 0;

    return `
      <tr data-file-id="${file.id}">
        <td>
          <div class="file-name-cell">
            <div class="file-type-icon">${fileTypeIcon(file.mime_type)}</div>
            <span class="file-name-text" title="${escapeAttr(file.original_name)}">${escapeHtmlDash(file.original_name)}</span>
          </div>
        </td>
        <td>${formatBytes(file.size)}</td>
        <td>${file.download_count.toLocaleString()}</td>
        <td>
          <button class="timer-badge-btn ${isTimerActive ? 'active' : ''}" 
                  title="Click to change download delay seconds" 
                  onclick="changeFileTimer(${file.id}, ${timer})">
            ⏱️ ${timerText}
          </button>
        </td>
        <td>${formatDate(file.created_at)}</td>
        <td>
          <div class="file-actions">
            <button class="btn-icon" title="Copy share link" onclick="copyShareLink('${file.share_id}', this)">
              ${icon('copy')}
            </button>
            <a href="/d/${file.share_id}" target="_blank" class="btn-icon" title="Open download page">
              ${icon('externalLink')}
            </a>
            <button class="btn-icon" title="Delete file" onclick="deleteFile(${file.id}, '${escapeAttr(file.original_name)}')">
              ${icon('trash')}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ------------------------------------------
   Change File Timer
   ------------------------------------------ */
async function changeFileTimer(fileId, currentSeconds) {
  const input = prompt('Enter download delay in seconds (Enter 0 for Instant Direct Download):', currentSeconds);
  if (input === null) return;

  const seconds = Math.max(0, parseInt(input, 10) || 0);

  try {
    const res = await fetch(`/api/files/${fileId}/timer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ seconds })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update timer.', 'error');
      return;
    }

    showToast(data.message, 'success');
    await loadFiles();
  } catch (err) {
    showToast('Network error updating timer.', 'error');
  }
}

/* ------------------------------------------
   Danger Zone: Account Deletion
   ------------------------------------------ */
function initDangerZone() {
  const deleteBtn = document.getElementById('delete-account-btn');
  if (!deleteBtn) return;

  deleteBtn.addEventListener('click', async () => {
    const confirmation = prompt('To permanently delete your account and all uploaded files, type "DELETE" below:');
    if (confirmation !== 'DELETE') {
      if (confirmation !== null) showToast('Deletion cancelled (did not type DELETE).', 'info');
      return;
    }

    try {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting Account...';

      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete My Account';
        showToast(data.error || 'Failed to delete account.', 'error');
        return;
      }

      alert('Your account and files have been permanently deleted.');
      window.location.href = '/signup.html';
    } catch {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete My Account';
      showToast('Network error deleting account.', 'error');
    }
  });
}

/* ------------------------------------------
   File Actions
   ------------------------------------------ */
async function copyShareLink(shareId, btnEl) {
  const url = getDownloadUrl(shareId);
  const success = await copyToClipboard(url);

  if (success) {
    showToast('Share link copied!', 'success');

    if (btnEl) {
      btnEl.classList.add('copied');
      btnEl.innerHTML = icon('check');
      setTimeout(() => {
        btnEl.classList.remove('copied');
        btnEl.innerHTML = icon('copy');
      }, 2000);
    }
  }
}

async function deleteFile(fileId, fileName) {
  if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;

  try {
    const res = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Delete failed.', 'error');
      return;
    }

    showToast('File deleted.', 'success');

    const row = document.querySelector(`tr[data-file-id="${fileId}"]`);
    if (row) {
      row.style.opacity = '0';
      row.style.transform = 'translateX(-20px)';
      row.style.transition = 'all 0.3s ease';
      setTimeout(() => row.remove(), 300);
    }

    await loadStats();
    setTimeout(loadFiles, 400);
  } catch (err) {
    showToast('Connection error. Please try again.', 'error');
  }
}

/* ------------------------------------------
   Helpers
   ------------------------------------------ */
function escapeHtmlDash(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
