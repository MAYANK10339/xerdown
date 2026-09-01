/* ==========================================================
   XERDOWN — Ultra-Concurrency Parallel Streaming Engine
   Supports: 100MB - 100GB+ Files with 16 Parallel Streams,
   Instant Deduplication (0.01s), and Custom Download Timer.
   ========================================================== */

class UploadEngine {
  constructor(options = {}) {
    this.onComplete = options.onComplete || (() => {});
    this.onFileProgress = options.onFileProgress || (() => {});
    this.onFileComplete = options.onFileComplete || (() => {});
    this.onFileError = options.onFileError || (() => {});
    this.onFileStart = options.onFileStart || (() => {});

    this.activeUploads = new Map();
    this.queue = [];
    this.maxConcurrentFiles = 3;
    this.runningFiles = 0;
    this.totalFiles = 0;
    this.completedFiles = 0;
    this._idCounter = 0;
  }

  /**
   * Queue files for upload with optional download wait timer (seconds)
   */
  uploadFiles(files, downloadTimer = 0) {
    const ids = [];
    const fileArray = Array.from(files);
    this.totalFiles += fileArray.length;

    for (const file of fileArray) {
      const id = `upload-${++this._idCounter}-${Date.now()}`;
      this.queue.push({ id, file, downloadTimer });
      ids.push(id);
      this.onFileStart(id, file, downloadTimer);
    }

    this._processQueue();
    return ids;
  }

  /**
   * Cancel specific upload
   */
  cancel(id) {
    const active = this.activeUploads.get(id);
    if (active) {
      if (active.abortController) active.abortController.abort();
      if (active.activeXhrs) active.activeXhrs.forEach(xhr => xhr.abort());
      this.activeUploads.delete(id);
      this.runningFiles--;
      this.onFileError(id, 'Upload cancelled');
      this._processQueue();
      return;
    }

    const idx = this.queue.findIndex(item => item.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.onFileError(id, 'Upload cancelled');
    }
  }

  /** @private */
  async _processQueue() {
    while (this.runningFiles < this.maxConcurrentFiles && this.queue.length > 0) {
      const item = this.queue.shift();
      this._startUploadTask(item);
    }
  }

  /** @private */
  async _startUploadTask(item) {
    const { id, file, downloadTimer } = item;

    // 1. Instant Deduplication Fast-Track Check (< 0.02s)
    try {
      const instantCheckRes = await fetch('/api/files/check-instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
          downloadTimer: downloadTimer || 0
        })
      });

      if (instantCheckRes.ok) {
        const instantData = await instantCheckRes.json();
        if (instantData.instant) {
          this.onFileProgress(id, {
            loaded: file.size,
            total: file.size,
            percent: 100,
            speed: 0,
            statusText: 'Instant Fast-Track (100%)',
            file
          });
          this.completedFiles++;
          this.onFileComplete(id, instantData, file);
          this._checkAllDone();
          this._processQueue();
          return;
        }
      }
    } catch {
      // Fall through to streaming
    }

    // 2. Adaptive Stream Sizing for 100MB - 100GB+
    if (file.size > 10 * 1024 * 1024) {
      this._startChunkedUpload(item);
    } else {
      this._startStandardUpload(item);
    }
  }

  /**
   * Fast standard upload for small files (<= 10MB)
   * @private
   */
  _startStandardUpload({ id, file, downloadTimer }) {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;
    const speedSamples = [];

    this.activeUploads.set(id, { xhr, activeXhrs: [xhr], file, startTime });
    this.runningFiles++;

    const formData = new FormData();
    formData.append('files', file);
    formData.append('downloadTimer', (downloadTimer || 0).toString());

    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      const loadedDiff = e.loaded - lastLoaded;

      if (elapsed > 0.05) {
        const instantSpeed = loadedDiff / elapsed;
        speedSamples.push(instantSpeed);
        if (speedSamples.length > 8) speedSamples.shift();
        lastLoaded = e.loaded;
        lastTime = now;
      }

      const avgSpeed = speedSamples.length > 0
        ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
        : 0;

      const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));

      this.onFileProgress(id, {
        loaded: e.loaded,
        total: e.total,
        percent,
        speed: avgSpeed,
        file
      });
    });

    xhr.addEventListener('load', () => {
      this.activeUploads.delete(id);
      this.runningFiles--;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          this.completedFiles++;
          this.onFileComplete(id, response, file);
        } catch {
          this.onFileError(id, 'Invalid server response');
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          this.onFileError(id, err.error || 'Upload failed');
        } catch {
          this.onFileError(id, `Upload failed (${xhr.status})`);
        }
      }

      this._checkAllDone();
      this._processQueue();
    });

    xhr.addEventListener('error', () => {
      this.activeUploads.delete(id);
      this.runningFiles--;
      this.onFileError(id, 'Network connection error');
      this._checkAllDone();
      this._processQueue();
    });

    xhr.send(formData);
  }

  /**
   * Ultra-Concurrency Parallel Chunked Upload for massive files (100MB - 100GB+)
   * @private
   */
  async _startChunkedUpload({ id, file, downloadTimer }) {
    const totalSize = file.size;
    const isHuge = totalSize >= 5 * 1024 * 1024 * 1024; // >= 5GB
    const isLarge = totalSize >= 1024 * 1024 * 1024; // >= 1GB

    const chunkSize = isHuge ? 64 * 1024 * 1024 : (isLarge ? 40 * 1024 * 1024 : 16 * 1024 * 1024);
    const maxWorkers = isHuge ? 16 : (isLarge ? 12 : 8);

    const totalChunks = Math.ceil(totalSize / chunkSize);
    const activeXhrs = new Set();
    const abortController = new AbortController();

    this.activeUploads.set(id, {
      file,
      activeXhrs,
      abortController,
      startTime: Date.now()
    });
    this.runningFiles++;

    try {
      const initRes = await fetch('/api/files/chunk-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortController.signal,
        body: JSON.stringify({
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          totalSize,
          totalChunks,
          downloadTimer: downloadTimer || 0
        })
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || 'Failed to initialize stream session');
      }

      const { uploadId } = await initRes.json();

      const chunkBytesUploaded = new Array(totalChunks).fill(0);
      let nextChunkIndex = 0;
      let lastTime = Date.now();
      let lastTotalLoaded = 0;
      const speedSamples = [];

      const uploadSingleChunk = (chunkIndex) => {
        return new Promise((resolve, reject) => {
          if (abortController.signal.aborted) return reject(new Error('Upload aborted'));

          const startByte = chunkIndex * chunkSize;
          const endByte = Math.min(startByte + chunkSize, totalSize);
          const chunkBlob = file.slice(startByte, endByte);

          const xhr = new XMLHttpRequest();
          activeXhrs.add(xhr);

          const formData = new FormData();
          formData.append('uploadId', uploadId);
          formData.append('chunkIndex', chunkIndex.toString());
          formData.append('chunk', chunkBlob, `chunk_${chunkIndex}`);

          xhr.open('POST', '/api/files/chunk-upload');
          xhr.withCredentials = true;

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              chunkBytesUploaded[chunkIndex] = e.loaded;
            }

            const currentTotalLoaded = chunkBytesUploaded.reduce((a, b) => a + b, 0);
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;

            if (elapsed > 0.05) {
              const diff = currentTotalLoaded - lastTotalLoaded;
              const instantSpeed = diff / elapsed;
              speedSamples.push(instantSpeed);
              if (speedSamples.length > 8) speedSamples.shift();
              lastTotalLoaded = currentTotalLoaded;
              lastTime = now;
            }

            const avgSpeed = speedSamples.length > 0
              ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
              : 0;

            const percent = Math.min(99, Math.round((currentTotalLoaded / totalSize) * 100));

            this.onFileProgress(id, {
              loaded: currentTotalLoaded,
              total: totalSize,
              percent,
              speed: avgSpeed,
              file
            });
          });

          xhr.addEventListener('load', () => {
            activeXhrs.delete(xhr);
            if (xhr.status >= 200 && xhr.status < 300) {
              chunkBytesUploaded[chunkIndex] = endByte - startByte;
              resolve();
            } else {
              reject(new Error(`Chunk failed (${xhr.status})`));
            }
          });

          xhr.addEventListener('error', () => {
            activeXhrs.delete(xhr);
            reject(new Error(`Network error on chunk ${chunkIndex}`));
          });

          xhr.addEventListener('abort', () => {
            activeXhrs.delete(xhr);
            reject(new Error('Chunk upload aborted'));
          });

          xhr.send(formData);
        });
      };

      const workerPool = async () => {
        while (nextChunkIndex < totalChunks) {
          if (abortController.signal.aborted) break;
          const currentIndex = nextChunkIndex++;
          await uploadSingleChunk(currentIndex);
        }
      };

      const workers = [];
      const numWorkers = Math.min(maxWorkers, totalChunks);
      for (let i = 0; i < numWorkers; i++) {
        workers.push(workerPool());
      }

      await Promise.all(workers);

      // Complete & Merge
      this.onFileProgress(id, {
        loaded: totalSize,
        total: totalSize,
        percent: 99,
        speed: 0,
        statusText: 'Assembling high-speed stream...',
        file
      });

      const completeRes = await fetch('/api/files/chunk-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uploadId })
      });

      if (!completeRes.ok) {
        const errData = await completeRes.json();
        throw new Error(errData.error || 'Stream merge failed');
      }

      const completeData = await completeRes.json();
      this.activeUploads.delete(id);
      this.runningFiles--;
      this.completedFiles++;
      this.onFileComplete(id, completeData, file);

    } catch (err) {
      this.activeUploads.delete(id);
      this.runningFiles--;
      this.onFileError(id, err.message || 'Stream error');
    }

    this._checkAllDone();
    this._processQueue();
  }

  /** @private */
  _checkAllDone() {
    if (this.runningFiles === 0 && this.queue.length === 0) {
      this.onComplete(this.completedFiles, this.totalFiles);
      this.totalFiles = 0;
      this.completedFiles = 0;
    }
  }
}

/**
 * Drag & drop init with Download Timer selector
 */
function initUploadZone(zone, input, onFiles) {
  if (!zone || !input) return;

  zone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && !e.target.closest('.timer-control-wrapper')) {
      input.click();
    }
  });

  let dragCounter = 0;

  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    zone.classList.remove('drag-over');

    if (e.dataTransfer.files.length > 0) {
      const timerSelect = document.getElementById('upload-timer-select');
      const timerValue = timerSelect ? parseInt(timerSelect.value, 10) : 0;
      onFiles(e.dataTransfer.files, timerValue);
    }
  });

  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      const timerSelect = document.getElementById('upload-timer-select');
      const timerValue = timerSelect ? parseInt(timerSelect.value, 10) : 0;
      onFiles(input.files, timerValue);
      input.value = '';
    }
  });
}

/**
 * Create progress item
 */
function createProgressItem(id, file, downloadTimer) {
  const item = document.createElement('div');
  item.className = 'upload-progress-item glass-card';
  item.id = `progress-${id}`;
  const isLarge = file.size >= 1024 * 1024 * 1024;
  const isMedium = file.size >= 10 * 1024 * 1024;
  
  let badges = '';
  if (isLarge) {
    badges += '<span class="hyperspeed-badge">16x Stream · Turbo</span>';
  } else if (isMedium) {
    badges += '<span class="hyperspeed-badge">8x Stream</span>';
  }

  if (downloadTimer > 0) {
    badges += `<span class="timer-badge">${downloadTimer}s Delay</span>`;
  } else {
    badges += `<span class="instant-badge">Instant 0s</span>`;
  }

  item.innerHTML = `
    <div class="upload-progress-top">
      <div class="upload-file-info">
        <div class="file-type-icon">${fileTypeIcon(file.type)}</div>
        <div class="upload-file-meta-col">
          <div class="upload-file-name" title="${file.name}">${truncateFilename(file.name, 38)}</div>
          <div class="upload-file-size">
            ${formatBytes(file.size)} 
            ${badges}
          </div>
        </div>
      </div>
      <div class="upload-progress-stats">
        <span class="upload-speed" data-speed>Connecting...</span>
        <span class="upload-percent" data-percent>0%</span>
      </div>
    </div>
    <div class="upload-progress-bar">
      <div class="upload-progress-fill" data-fill style="width: 0%"></div>
    </div>
  `;
  return item;
}

/**
 * Update progress item
 */
function updateProgressItem(id, data) {
  const item = document.getElementById(`progress-${id}`);
  if (!item) return;

  const fill = item.querySelector('[data-fill]');
  const speed = item.querySelector('[data-speed]');
  const percent = item.querySelector('[data-percent]');

  if (fill) fill.style.width = `${data.percent}%`;
  if (speed) {
    if (data.statusText) {
      speed.textContent = data.statusText;
    } else {
      speed.textContent = formatSpeed(data.speed);
    }
  }
  if (percent) percent.textContent = `${data.percent}%`;
}

/**
 * Mark complete
 */
function markProgressComplete(id) {
  const item = document.getElementById(`progress-${id}`);
  if (!item) return;

  item.classList.add('upload-complete');
  const speed = item.querySelector('[data-speed]');
  const percent = item.querySelector('[data-percent]');
  const fill = item.querySelector('[data-fill]');

  if (speed) {
    speed.innerHTML = `${icon('check')} Complete`;
    speed.style.color = 'var(--accent)';
  }
  if (percent) percent.textContent = '100%';
  if (fill) fill.style.width = '100%';
}

/**
 * Mark error
 */
function markProgressError(id, error) {
  const item = document.getElementById(`progress-${id}`);
  if (!item) return;

  const speed = item.querySelector('[data-speed]');
  const percent = item.querySelector('[data-percent]');

  if (speed) {
    speed.innerHTML = `${icon('alertCircle')} ${error}`;
    speed.style.color = 'var(--danger)';
  }
  if (percent) {
    percent.textContent = 'Failed';
    percent.style.color = 'var(--danger)';
  }
}
