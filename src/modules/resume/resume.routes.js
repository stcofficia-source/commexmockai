const express = require('express');
const controller = require('./resume.controller');

const router = express.Router();

router.get('/workspace', controller.getWorkspace);
router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:resumeId', controller.update);
router.delete('/:resumeId', controller.remove);

module.exports = router;
