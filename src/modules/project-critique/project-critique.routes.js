const express = require('express');
const controller = require('./project-critique.controller');

const router = express.Router();
router.post('/suggest-metadata', controller.suggestMetadata);
router.post('/analyze', controller.analyze);
module.exports = router;
