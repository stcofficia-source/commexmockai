const assessmentService = require('./physical-assessment.service');

function tokenFor(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
}

async function catalog(req, res, next) {
  try { res.json({ success: true, data: await assessmentService.catalog(tokenFor(req)) }); } catch (error) { next(error); }
}

async function history(req, res, next) {
  try { res.json({ success: true, data: await assessmentService.history(tokenFor(req)) }); } catch (error) { next(error); }
}

async function report(req, res, next) {
  try { res.json({ success: true, data: await assessmentService.report(req.params.attemptId, tokenFor(req)) }); } catch (error) { next(error); }
}

async function reportPdf(req, res, next) {
  try {
    const response = await assessmentService.reportPdf(req.params.attemptId, tokenFor(req));
    res.status(response.status).set('content-type', response.contentType).send(response.data);
  } catch (error) { next(error); }
}

async function start(req, res, next) {
  try { res.status(201).json({ success: true, data: await assessmentService.start(req.body, tokenFor(req)) }); } catch (error) { next(error); }
}

async function answer(req, res, next) {
  try { res.json({ success: true, data: await assessmentService.answer(req.params.attemptId, req.params.questionId, req.body, tokenFor(req)) }); } catch (error) { next(error); }
}

async function complete(req, res, next) {
  try { res.json({ success: true, data: await assessmentService.complete(req.params.attemptId, req.body, tokenFor(req)) }); } catch (error) { next(error); }
}

module.exports = { catalog, history, report, reportPdf, start, answer, complete };
