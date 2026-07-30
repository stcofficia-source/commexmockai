const express = require('express');
const controller = require('./presentation-coach.controller');

const router = express.Router();
router.post('/analyze', controller.analyze);

module.exports = router;
