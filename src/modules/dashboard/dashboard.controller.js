/**
 * Dashboard Module — Controller
 * Handles HTTP requests for dashboard data
 */
const dashboardService = require('./dashboard.service');
const logger = require('../../core/logger');

const dashboardController = {
  /**
   * GET /api/dashboard/summary
   * Returns aggregated dashboard summary for the authenticated user
   */
  getSummary: async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const summary = await dashboardService.getDashboardSummary(userId, req.headers.authorization);
      res.json({
        success: true,
        data: summary,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch dashboard summary');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard summary',
      });
    }
  },

  /**
   * GET /api/dashboard/today-plan
   * Returns today's learning plan items
   */
  getTodayPlan: async (req, res) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const plan = await dashboardService.getTodayPlan(userId, req.headers.authorization);
      res.json({
        success: true,
        data: plan,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch today plan');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch today plan',
      });
    }
  },

  /**
   * GET /api/dashboard/recommended
   * Returns AI-recommended courses/resources
   */
  getRecommended: async (req, res) => {
    try {
      const recommended = await dashboardService.getRecommended(req.headers.authorization);
      res.json({
        success: true,
        data: recommended,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch recommendations');
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recommendations',
      });
    }
  },
};

module.exports = dashboardController;
