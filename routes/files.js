const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Ensure upload & temporary chunks directories exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const tempChunksDir = path.join(uploadsDir, 'temp_chunks');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(tempChunksDir)) {
  fs.mkdirSync(tempChunksDir, { recursive: true });
}

// Multer disk storage config for standard uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${nanoid(12)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: Infinity }
});

// Multer for chunk uploads (memory buffer for immediate fast stream write)
const chunkStorage = multer.memoryStorage();
const uploadChunkMulter = multer({
  storage: chunkStorage,
  limits: { fileSize: Infinity }
});

// ==========================================
// 1. INSTANT UPLOAD (Fast-Track Deduplication)
// ==========================================
router.post('/check-instant', authMiddleware, async (req, res) => {
  try {
    const { originalName, size, mimeType } = req.body;
    const fileSize = parseInt(size, 10);

    if (!originalName || !fileSize) {
      return res.json({ instant: false });
    }

    // Check if an identical file already exists on server disk
    const existing = db.prepare(`
      SELECT stored_name, mime_type FROM files 
      WHERE size = ? AND original_name = ?
      ORDER BY id DESC LIMIT 1
    `).get(fileSize, originalName);

    if (existing) {
      const diskPath = path.join(uploadsDir, existing.stored_name);
      if (fs.existsSync(diskPath)) {
        // Fast-track duplicate record creation with zero network transfer
        const shareId = nanoid(10);
        const newStoredName = `${Date.now()}-${nanoid(12)}${path.extname(originalName)}`;
        const newDiskPath = path.join(uploadsDir, newStoredName);

        // Instant hard link / fast copy on disk
        try {
          await fs.promises.copyFile(diskPath, newDiskPath);
        } catch {
          // fallback if copy fails
          return res.json({ instant: false });
        }

        const insertStmt = db.prepare(`
          INSERT INTO files (user_id, original_name, stored_name, mime_type, size, share_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const updateStorage = db.prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?');

        db.transaction(() => {
          insertStmt.run(
            req.user.id,
            originalName,
            newStoredName,
            mimeType || existing.mime_type || 'application/octet-stream',
            fileSize,
            shareId
          );
          updateStorage.run(fileSize, req.user.id);
        })();

        return res.json({
          instant: true,
          message: 'Instant Fast-Track Upload Complete',
          file: {
            original_name: originalName,
            size: fileSize,
            mime_type: mimeType || existing.mime_type,
            share_id: shareId
          }
        });
      }
    }

    res.json({ instant: false });
  } catch (err) {
    console.error('Instant check error:', err);
    res.json({ instant: false });
  }
});

// ==========================================
// 2. STANDARD UPLOAD (Single / Multiple)
// ==========================================
router.post('/upload', authMiddleware, upload.array('files'), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO files (user_id, original_name, stored_name, mime_type, size, share_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStorage = db.prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?');
    const uploadedFiles = [];

    const insertAll = db.transaction(() => {
      for (const file of req.files) {
        const shareId = nanoid(10);
        insertStmt.run(
          req.user.id,
          file.originalname,
          file.filename,
          file.mimetype || 'application/octet-stream',
          file.size,
          shareId
        );
        updateStorage.run(file.size, req.user.id);

        uploadedFiles.push({
          original_name: file.originalname,
          size: file.size,
          mime_type: file.mimetype,
          share_id: shareId
        });
      }
    });

    insertAll();

    res.status(201).json({
      message: `${uploadedFiles.length} file(s) uploaded successfully.`,
      files: uploadedFiles
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ============================================================
// 3. PARALLEL CHUNKED UPLOAD (For 800MB - 12GB+ files)
// ============================================================
const activeSessions = new Map();

router.post('/chunk-init', authMiddleware, (req, res) => {
  try {
    const { originalName, mimeType, totalSize, totalChunks } = req.body;

    if (!originalName || !totalSize || !totalChunks) {
      return res.status(400).json({ error: 'Missing chunk session parameters.' });
    }

    const uploadId = `${Date.now()}_${nanoid(16)}`;
    const sessionDir = path.join(tempChunksDir, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    activeSessions.set(uploadId, {
      userId: req.user.id,
      originalName,
      mimeType: mimeType || 'application/octet-stream',
      totalSize: parseInt(totalSize, 10),
      totalChunks: parseInt(totalChunks, 10),
      receivedChunks: new Set(),
      sessionDir,
      createdAt: Date.now()
    });

    res.status(200).json({
      uploadId,
      message: 'Chunk upload session initialized.'
    });
  } catch (err) {
    console.error('Chunk init error:', err);
    res.status(500).json({ error: 'Failed to initialize chunk upload.' });
  }
});

router.post('/chunk-upload', authMiddleware, uploadChunkMulter.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.body;
    const index = parseInt(chunkIndex, 10);

    const session = activeSessions.get(uploadId);
    if (!session || session.userId !== req.user.id) {
      return res.status(400).json({ error: 'Invalid or expired upload session.' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No chunk data received.' });
    }

    const chunkPath = path.join(session.sessionDir, `part_${index.toString().padStart(6, '0')}`);
    await fs.promises.writeFile(chunkPath, req.file.buffer);

    session.receivedChunks.add(index);

    res.status(200).json({
      success: true,
      chunkIndex: index,
      receivedCount: session.receivedChunks.size,
      totalChunks: session.totalChunks
    });
  } catch (err) {
    console.error('Chunk upload error:', err);
    res.status(500).json({ error: 'Chunk write failed.' });
  }
});

router.post('/chunk-complete', authMiddleware, async (req, res) => {
  try {
    const { uploadId } = req.body;
    const session = activeSessions.get(uploadId);

    if (!session || session.userId !== req.user.id) {
      return res.status(400).json({ error: 'Upload session not found.' });
    }

    if (session.receivedChunks.size !== session.totalChunks) {
      return res.status(400).json({
        error: `Missing chunks: received ${session.receivedChunks.size}/${session.totalChunks}`
      });
    }

    const storedName = `${Date.now()}-${nanoid(12)}${path.extname(session.originalName)}`;
    const finalFilePath = path.join(uploadsDir, storedName);
    const finalWriteStream = fs.createWriteStream(finalFilePath, { highWaterMark: 16 * 1024 * 1024 });

    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.sessionDir, `part_${i.toString().padStart(6, '0')}`);
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath, { highWaterMark: 16 * 1024 * 1024 });
        readStream.on('error', reject);
        readStream.on('end', resolve);
        readStream.pipe(finalWriteStream, { end: false });
      });
    }

    finalWriteStream.end();
    await new Promise((resolve, reject) => {
      finalWriteStream.on('finish', resolve);
      finalWriteStream.on('error', reject);
    });

    fs.rm(session.sessionDir, { recursive: true, force: true }, () => {});
    activeSessions.delete(uploadId);

    const shareId = nanoid(10);
    const stat = await fs.promises.stat(finalFilePath);
    const actualSize = stat.size;

    const insertStmt = db.prepare(`
      INSERT INTO files (user_id, original_name, stored_name, mime_type, size, share_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const updateStorage = db.prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?');

    db.transaction(() => {
      insertStmt.run(
        req.user.id,
        session.originalName,
        storedName,
        session.mimeType,
        actualSize,
        shareId
      );
      updateStorage.run(actualSize, req.user.id);
    })();

    res.status(201).json({
      message: 'Upload complete',
      file: {
        original_name: session.originalName,
        size: actualSize,
        mime_type: session.mimeType,
        share_id: shareId
      }
    });
  } catch (err) {
    console.error('Chunk merge error:', err);
    res.status(500).json({ error: 'Failed to assemble chunked file.' });
  }
});

// ==========================================
// 4. FILE LISTING, STATS & DELETION
// ==========================================
router.get('/', authMiddleware, (req, res) => {
  try {
    const files = db.prepare(`
      SELECT id, original_name, mime_type, size, share_id, download_count, created_at
      FROM files WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ files });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Could not fetch files.' });
  }
});

router.get('/stats', authMiddleware, (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_files,
        COALESCE(SUM(size), 0) as total_size,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM files WHERE user_id = ?
    `).get(req.user.id);

    const user = db.prepare('SELECT storage_used FROM users WHERE id = ?').get(req.user.id);

    res.json({
      total_files: stats.total_files,
      total_size: stats.total_size,
      total_downloads: stats.total_downloads,
      storage_used: user.storage_used
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Could not fetch stats.' });
  }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const filePath = path.join(uploadsDir, file.stored_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
    db.prepare('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?').run(file.size, req.user.id);

    res.json({ message: 'File deleted successfully.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Could not delete file.' });
  }
});

module.exports = router;
