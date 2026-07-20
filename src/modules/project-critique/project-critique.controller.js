const multer = require('multer');
const service = require('./project-critique.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 5 } }).array('files', 5);
const userId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

function analyze(req, res, next) {
  upload(req, res, async (uploadError) => {
    if (uploadError) return next(uploadError);
    try {
      const data = await service.analyze({ studentId: userId(req), authHeader: req.headers.authorization, payload: req.body, files: req.files || [] });
      return res.status(201).json({ success: true, data });
    } catch (error) { return next(error); }
  });
}

module.exports = { analyze };
