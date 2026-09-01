const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');

// GET /api/download/:shareId/info — File metadata + Download wait timer
router.get('/:shareId/info', (req, res) => {
  try {
    const file = db.prepare(`
      SELECT f.original_name, f.mime_type, f.size, f.download_count, f.download_timer, f.created_at, u.username as creator_name
      FROM files f
      JOIN users u ON f.user_id = u.id
      WHERE f.share_id = ?
    `).get(req.params.shareId);

    if (!file) {
      return res.status(404).json({ error: 'File not found or link expired.' });
    }

    res.json({
      file: {
        original_name: file.original_name,
        mime_type: file.mime_type,
        size: file.size,
        download_count: file.download_count,
        download_timer: file.download_timer || 0,
        creator_name: file.creator_name,
        created_at: file.created_at
      }
    });
  } catch (err) {
    console.error('File info error:', err);
    res.status(500).json({ error: 'Could not fetch file info.' });
  }
});

// GET /api/download/:shareId — Stream file download
router.get('/:shareId', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE share_id = ?').get(req.params.shareId);

    if (!file) {
      return res.status(404).json({ error: 'File not found or link expired.' });
    }

    const filePath = path.join(uploadsDir, file.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File no longer exists on server.' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Handle Range requests
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      const chunkSize = end - start + 1;

      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
        'Cache-Control': 'no-cache'
      });

      const stream = fs.createReadStream(filePath, {
        start,
        end,
        highWaterMark: 16 * 1024 * 1024
      });

      stream.pipe(res);
    } else {
      res.set({
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });

      const stream = fs.createReadStream(filePath, {
        highWaterMark: 16 * 1024 * 1024
      });

      stream.pipe(res);
    }

    // Increment download count
    db.prepare('UPDATE files SET download_count = download_count + 1 WHERE id = ?').run(file.id);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed.' });
  }
});

module.exports = router;
