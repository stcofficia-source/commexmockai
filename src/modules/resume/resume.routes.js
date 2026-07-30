const express = require('express');
const controller = require('./resume.controller');
const validateBody = require('../../core/middleware/validate-body');
const { atsReviewSchema } = require('./resume.validation');

const router = express.Router();

router.get('/workspace', controller.getWorkspace);
router.put('/onboarding/:tourKey', controller.completeTour);
router.post('/analyze', controller.analyzeUpload);
router.get('/ats-review/config', controller.getAtsReviewExperience);
router.post('/ats-review', validateBody(atsReviewSchema), controller.reviewAts);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:resumeId', controller.update);
router.delete('/:resumeId', controller.remove);

module.exports = router;
