const express = require('express');
const controller = require('./project-critique.controller');

const router = express.Router();
router.post('/analyze', controller.analyze);
module.exports = router;
