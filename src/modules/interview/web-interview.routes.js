/**
 * Browser interview API.
 *
 * Kept on a distinct path from the mobile REST/WebSocket contract so browser
 * performance changes never alter the React Native client behaviour.
 */
const express = require('express');
const validate = require('../../core/middleware/validate');
const controller = require('./interview.controller');
const { getRolesSchema } = require('./interview.validation');

const router = express.Router();

router.get('/departments', controller.getDepartments);
router.get('/departments/:id/roles', validate(getRolesSchema), controller.getRolesByDepartment);
router.get('/roles/:id', controller.getRoleDetail);
router.get('/tts/stream', require('../tts/tts.controller').streamTts);
router.post('/', controller.handleWebInterviewSession);

module.exports = router;
