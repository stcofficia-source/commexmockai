const express = require('express');
const controller = require('./mentor.controller');

const router = express.Router();

router.post('/chat', controller.chat);

module.exports = router;
