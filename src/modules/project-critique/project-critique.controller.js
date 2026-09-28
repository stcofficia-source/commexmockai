const multer = require('multer');
const service = require('./project-critique.service');
const { ValidationError } = require('../../core/errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 3,
    fields: 20,
    parts: 30,
  },
}).array('files', 3);
const userId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

function analyze(req, res, next) {
  upload(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 10 MB or smaller.'
        : uploadError.code === 'LIMIT_FILE_COUNT'
          ? 'Upload at most 3 files.'
          : 'The project upload is invalid or exceeds a safety limit.';
      return next(new ValidationError(message));
    }
    try {
      const data = await service.analyze({ studentId: userId(req), authHeader: req.headers.authorization, payload: req.body, files: req.files || [] });
      return res.status(201).json({ success: true, data });
    } catch (error) { return next(error); }
  });
}

function suggestMetadata(req, res, next) {
  upload(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 10 MB or smaller.'
        : uploadError.code === 'LIMIT_FILE_COUNT'
          ? 'Upload at most 3 files.'
          : 'The project upload is invalid or exceeds a safety limit.';
      return next(new ValidationError(message));
    }
    try {
      const data = await service.suggestMetadata({ studentId: userId(req), authHeader: req.headers.authorization, payload: req.body, files: req.files || [] });
      return res.json({ success: true, data });
    } catch (error) { return next(error); }
  });
}

module.exports = { analyze, suggestMetadata };
