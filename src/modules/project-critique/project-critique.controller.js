const multer = require('multer');
const service = require('./project-critique.service');
const { ValidationError } = require('../../core/errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
    fields: 20,
    parts: 30,
  },
}).array('files', 10);
const userId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

function analyze(req, res, next) {
  upload(req, res, async (uploadError) => {
    if (uploadError) {
      const message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'Each file must be 25 MB or smaller.'
        : uploadError.code === 'LIMIT_FILE_COUNT'
          ? 'Upload at most 10 files.'
          : 'The project upload is invalid or exceeds a safety limit.';
      return next(new ValidationError(message));
    }
    try {
      const data = await service.analyze({ studentId: userId(req), authHeader: req.headers.authorization, payload: req.body, files: req.files || [] });
      return res.status(201).json({ success: true, data });
    } catch (error) { return next(error); }
  });
}

module.exports = { analyze };
