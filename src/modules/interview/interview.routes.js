/**
 * Interview Routes
 */
const express = require('express');
const router = express.Router();
const controller = require('./interview.controller');

router.get('/departments', controller.getDepartments);
router.get('/stt/token', controller.getAssemblyToken);
router.get('/departments/:id/roles', controller.getRolesByDepartment);
router.get('/roles/:id', controller.getRoleDetail);
router.get('/interviews/:sessionId/report', controller.getReport);
router.get('/history', controller.getHistory);
router.post('/stt/upload', controller.uploadAnswerAudio);
router.get('/tts/stream', require('../tts/tts.controller').streamTts);

module.exports = router;
