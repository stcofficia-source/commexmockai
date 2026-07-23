const mentorService = require('./mentor.service');
const { reserveAiCredits } = require('../../core/credit-billing.service');

async function chat(req, res, next) {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ success: false, message: 'Write a question for your AI Mentor.' });
    }

    if (message.length > 1800) {
      return res.status(400).json({ success: false, message: 'Keep your message under 1,800 characters.' });
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    await reserveAiCredits({
      authorization: req.headers.authorization,
      serviceKey: 'ai_mentor',
      metadata: { feature: 'mentor_chat' },
    });
    const data = await mentorService.reply({
      message,
      history: req.body?.history,
      user: req.user,
      token,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { chat };
