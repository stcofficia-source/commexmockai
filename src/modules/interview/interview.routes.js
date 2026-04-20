/**
 * Interview Routes
 */
const express = require('express');
const router = express.Router();
const controller = require('./interview.controller');
const validate = require('../../core/middleware/validate');
const { getRolesSchema, getHistorySchema, uploadAudioSchema } = require('./interview.validation');

router.get('/departments', controller.getDepartments);
router.get('/stt/token', controller.getAssemblyToken);
router.get('/departments/:id/roles', validate(getRolesSchema), controller.getRolesByDepartment);
router.get('/roles/:id', controller.getRoleDetail);
router.get('/interviews/:sessionId/report', controller.getReport);
router.get('/history', validate(getHistorySchema), controller.getHistory);
router.post('/stt/upload', validate(uploadAudioSchema), controller.uploadAnswerAudio);
router.get('/tts/stream', require('../tts/tts.controller').streamTts);

module.exports = router;
