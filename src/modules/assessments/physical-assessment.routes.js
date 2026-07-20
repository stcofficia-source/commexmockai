const express = require('express');
const controller = require('./physical-assessment.controller');

const router = express.Router();

// Dedicated Action Routes & RESTful Param Routes
router.get('/catalog', controller.catalog);
router.post('/catalog', controller.catalog);

router.get('/history', controller.history);
router.post('/history', controller.history);

router.post('/start', controller.start);
router.post('/attempts', controller.start);

router.post('/answer', controller.answer);
router.put('/answer', controller.answer);
router.put('/attempts/:attemptId/answers/:questionId', controller.answer);

router.post('/complete', controller.complete);
router.post('/attempts/:attemptId/complete', controller.complete);

router.get('/report', controller.report);
router.post('/report', controller.report);
router.get('/attempts/:attemptId/report', controller.report);

router.get('/report.pdf', controller.reportPdf);
router.post('/report.pdf', controller.reportPdf);
router.get('/attempts/:attemptId/report.pdf', controller.reportPdf);

module.exports = router;
