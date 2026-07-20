const express = require('express');
const controller = require('./resume.controller');

const router = express.Router();

router.get('/workspace', controller.getWorkspace);
router.put('/onboarding/:tourKey', controller.completeTour);
router.post('/analyze', controller.analyzeUpload);
router.post('/ats-review', controller.reviewAts);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:resumeId', controller.update);
router.delete('/:resumeId', controller.remove);

module.exports = router;
