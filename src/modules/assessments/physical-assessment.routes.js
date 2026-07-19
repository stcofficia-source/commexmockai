const express = require('express');
const controller = require('./physical-assessment.controller');

const router = express.Router();

router.get('/catalog', controller.catalog);
router.get('/history', controller.history);
router.get('/attempts/:attemptId/report', controller.report);
router.get('/attempts/:attemptId/report.pdf', controller.reportPdf);
router.post('/attempts', controller.start);
router.put('/attempts/:attemptId/answers/:questionId', controller.answer);
router.post('/attempts/:attemptId/complete', controller.complete);

module.exports = router;
