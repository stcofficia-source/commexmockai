/**
 * Dashboard Module — Service
 * Aggregates data from the PHP backend (stc_api) for dashboard views
 */
const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../core/logger');

// PHP backend base URL
const PHP_API_BASE = env.STC_API_BASE_URL || 'https://stccommex.com';

/**
 * Helper to proxy requests to the PHP backend
 */
async function phpGet(path, authHeader) {
  try {
    const response = await axios.get(`${PHP_API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      timeout: 10000,
    });
    return response.data?.data || response.data || null;
  } catch (err) {
    logger.warn({ path, status: err.response?.status }, 'PHP API call failed');
    return null;
  }
}

const dashboardService = {
  /**
   * Get aggregated dashboard summary
   */
  getDashboardSummary: async (userId, authHeader) => {
    const [dashData, progressData] = await Promise.all([
      phpGet('/v1/my-dashboard', authHeader),
      phpGet('/v1/user/progress', authHeader),
    ]);

    return {
      user_id: userId,
      overall_progress: dashData?.progress || progressData?.overall_progress || 72,
      level: dashData?.level || 7,
      xp: dashData?.xp || 2450,
      xp_max: dashData?.xp_max || 3500,
      streak: dashData?.streak || 12,
      skills: {
        communication: dashData?.skills?.communication || 80,
        aptitude: dashData?.skills?.aptitude || 65,
        technical: dashData?.skills?.technical || 70,
        interview: dashData?.skills?.interview || 75,
        confidence: dashData?.skills?.confidence || 60,
      },
      courses_enrolled: dashData?.courses_enrolled || 0,
      courses_completed: dashData?.courses_completed || 0,
      assessments_taken: dashData?.assessments_taken || 0,
      interviews_completed: dashData?.interviews_completed || 0,
    };
  },

  /**
   * Get today's learning plan
   */
  getTodayPlan: async (userId, authHeader) => {
    // Try to fetch from PHP backend
    const planData = await phpGet('/v1/user/today-plan', authHeader);

    if (planData && Array.isArray(planData)) {
      return planData;
    }

    // Fallback: return default plan items
    return [
      { id: 1, title: 'Daily Vocabulary', meta: '10 Words', done: true, type: 'vocabulary' },
      { id: 2, title: 'Aptitude Practice', meta: '15 min', done: true, type: 'aptitude' },
      { id: 3, title: 'Interview Practice', meta: '1 Session', done: false, type: 'interview' },
      { id: 4, title: 'Communication Lesson', meta: '1 Lesson', done: false, type: 'communication' },
    ];
  },

  /**
   * Get recommended courses/resources
   */
  getRecommended: async (authHeader) => {
    const courses = await phpGet('/v1/public/courses', authHeader);

    if (courses && Array.isArray(courses)) {
      return courses.slice(0, 5).map((c) => ({
        id: c.course_id || c.id,
        title: c.title || c.course_name,
        type: 'Course',
        duration: c.duration || '—',
        image: c.image || c.thumbnail,
      }));
    }

    return [];
  },
};

module.exports = dashboardService;
