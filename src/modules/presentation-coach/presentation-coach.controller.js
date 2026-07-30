const service = require('./presentation-coach.service');
const { runBillableAiOperation } = require('../../core/credit-billing.service');

async function analyze(req, res, next) {
  try {
    const billed = await runBillableAiOperation({
      authorization: req.headers.authorization,
      serviceKey: 'presentation_coach',
      operation: () => service.analyze(req.body?.slides),
    });
    res.json({ success: true, data: billed.data });
  } catch (error) {
    next(error);
  }
}

module.exports = { analyze };
