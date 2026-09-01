/* ==========================================================
   XERDOWN — Dashboard Logic with Creator Monetization & UPI
   ========================================================== */

let currentUser = null;
let uploadEngine = null;
let currentUpiId = null;
let currentEarnings = 0;

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
  initMonetizationControls();
  initDangerZone();
}

/* ------------------------------------------
   Stats & Creator Wallet
   ------------------------------------------ */
async function loadStats() {
  try {
    const res = await fetch('/api/files/stats', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    const elFiles = document.getElementById('stat-files');
    const elStorage = document.getElementById('stat-storage');
    const elDownloads = document.getElementById('stat-downloads');
    const elEarnings = document.getElementById('stat-earnings');
    const elUpiDisplay = document.getElementById('upi-display');
    const upiInput = document.getElementById('upi-input');

    currentEarnings = data.earnings || 0.0;
    currentUpiId = data.upi_id || null;

    if (elFiles) elFiles.textContent = data.total_files.toLocaleString();
    if (elStorage) elStorage.textContent = formatBytes(data.total_size);
    if (elDownloads) elDownloads.textContent = data.total_downloads.toLocaleString();
    if (elEarnings) elEarnings.textContent = `₹${currentEarnings.toFixed(2)}`;

    if (elUpiDisplay) {
      if (currentUpiId) {
        elUpiDisplay.innerHTML = `<span class="upi-tag">✓ Linked: ${escapeHtmlDash(currentUpiId)}</span>`;
        if (upiInput && !upiInput.value) upiInput.value = currentUpiId;
      } else {
        elUpiDisplay.innerHTML = `<span class="upi-tag not-linked">Not Linked</span>`;
      }
    }
  } catch (err) {
    console.error('Stats load error:', err);
  }
}

/* ------------------------------------------
   Upload Zone with Monetization Toggle
   ------------------------------------------ */
function initUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  const progressList = document.getElementById('upload-progress-list');

  uploadEngine = new UploadEngine({
    onFileStart(id, file, isMonetized) {
      const item = createProgressItem(id, file, isMonetized);
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

  initUploadZone(zone, input, (files, isMonetized) => {
    uploadEngine.uploadFiles(files, isMonetized);
  });
}

/* ------------------------------------------
   Files List & Monetization Toggle
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

  tbody.innerHTML = files.map(file => `
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
        <button class="monetize-badge-btn ${file.is_monetized ? 'active' : ''}" 
                title="Click to toggle ₹5.00 Sponsor Gateway monetization" 
                onclick="toggleFileMonetization(${file.id})">
          ${file.is_monetized ? '₹5.00 Sponsor' : 'Free Direct'}
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
  `).join('');
}

/* ------------------------------------------
   Monetization & Instant UPI Payout Handlers
   ------------------------------------------ */
async function toggleFileMonetization(fileId) {
  try {
    const res = await fetch(`/api/files/${fileId}/monetize`, {
      method: 'PATCH',
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update monetization.', 'error');
      return;
    }

    showToast(data.message, 'success');
    await loadFiles();
  } catch (err) {
    showToast('Network error updating monetization.', 'error');
  }
}

function initMonetizationControls() {
  const saveUpiBtn = document.getElementById('save-upi-btn');
  const upiInput = document.getElementById('upi-input');
  const payoutBtn = document.getElementById('request-payout-btn');

  if (saveUpiBtn && upiInput) {
    saveUpiBtn.addEventListener('click', async () => {
      const upi = upiInput.value.trim();
      if (!upi || !upi.includes('@')) {
        showToast('Please enter a valid UPI ID (e.g. yourname@okhdfcbank or 9876543210@paytm)', 'error');
        upiInput.focus();
        return;
      }

      try {
        saveUpiBtn.disabled = true;
        saveUpiBtn.textContent = 'Saving...';

        const res = await fetch('/api/files/settings/upi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ upi_id: upi })
        });

        const data = await res.json();
        saveUpiBtn.disabled = false;
        saveUpiBtn.textContent = 'Save UPI ID';

        if (!res.ok) {
          showToast(data.error || 'Failed to save UPI ID', 'error');
          return;
        }

        showToast('UPI ID saved & verified successfully!', 'success');
        await loadStats();
      } catch {
        saveUpiBtn.disabled = false;
        saveUpiBtn.textContent = 'Save UPI ID';
        showToast('Network error saving UPI ID', 'error');
      }
    });
  }

  if (payoutBtn) {
    payoutBtn.addEventListener('click', async () => {
      if (!currentUpiId) {
        showToast('Please enter and save your UPI ID above first!', 'error');
        if (upiInput) upiInput.focus();
        return;
      }

      if (currentEarnings < 5) {
        showToast(`Minimum withdrawal is ₹5.00. Current earnings: ₹${currentEarnings.toFixed(2)}. Share your monetized link to earn ₹5.00/download!`, 'error');
        return;
      }

      try {
        payoutBtn.disabled = true;
        payoutBtn.textContent = 'Processing Transfer...';

        const res = await fetch('/api/files/payout/request', {
          method: 'POST',
          credentials: 'include'
        });

        const data = await res.json();
        payoutBtn.disabled = false;
        payoutBtn.textContent = 'Withdraw to UPI (Min ₹5)';

        if (!res.ok) {
          showToast(data.error || 'Payout request failed', 'error');
          return;
        }

        // Show Instant Receipt Modal
        showPayoutReceipt(data.details);
        await loadStats();
      } catch {
        payoutBtn.disabled = false;
        payoutBtn.textContent = 'Withdraw to UPI (Min ₹5)';
        showToast('Network error requesting payout', 'error');
      }
    });
  }
}

function showPayoutReceipt(details) {
  const modal = document.getElementById('payout-modal');
  const body = document.getElementById('receipt-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="receipt-amount">₹${details.amount.toFixed(2)}</div>
    <div class="receipt-row">
      <span>Paid To UPI</span>
      <strong>${escapeHtmlDash(details.upi_id)}</strong>
    </div>
    <div class="receipt-row">
      <span>Bank UTR Reference</span>
      <strong class="receipt-utr">${details.utr}</strong>
    </div>
    <div class="receipt-row">
      <span>Status</span>
      <strong style="color: var(--accent);">${details.status}</strong>
    </div>
    <div class="receipt-row">
      <span>Timestamp</span>
      <span>${new Date(details.timestamp).toLocaleString()}</span>
    </div>
  `;

  modal.style.display = 'flex';
}

window.closePayoutModal = function() {
  const modal = document.getElementById('payout-modal');
  if (modal) modal.style.display = 'none';
};

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
