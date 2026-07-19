/**
 * Dashboard Module — Routes
 * Aggregated dashboard data endpoints for the LMS platform
 */
const express = require('express');
const router = express.Router();
const controller = require('./dashboard.controller');

// GET /api/dashboard/summary — User's dashboard summary
router.get('/summary', controller.getSummary);

// GET /api/dashboard/today-plan — Today's learning plan
router.get('/today-plan', controller.getTodayPlan);

// GET /api/dashboard/recommended — Recommended courses
router.get('/recommended', controller.getRecommended);

module.exports = router;
