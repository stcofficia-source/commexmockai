const express = require('express');
const multer = require('multer');
const { AppError } = require('../../core/errors');
const controller = require('./word-assessment.controller');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (String(file.mimetype || '').toLowerCase().startsWith('audio/')) return callback(null, true);
    return callback(new AppError('Upload an audio recording to check pronunciation.', 422, 'INVALID_AUDIO'));
  },
});

router.post('/word-assessment', upload.single('audio'), controller.assessWord);

module.exports = router;
