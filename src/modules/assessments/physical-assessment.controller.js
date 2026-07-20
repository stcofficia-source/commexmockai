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
  try {
    const attemptId = req.params.attemptId || req.query.attemptId || req.query.assessmentId || req.body?.attemptId || req.body?.assessmentId;
    res.json({ success: true, data: await assessmentService.report(attemptId, tokenFor(req)) });
  } catch (error) { next(error); }
}

async function reportPdf(req, res, next) {
  try {
    const attemptId = req.params.attemptId || req.query.attemptId || req.query.assessmentId || req.body?.attemptId || req.body?.assessmentId;
    const response = await assessmentService.reportPdf(attemptId, tokenFor(req));
    res.status(response.status).set('content-type', response.contentType).send(response.data);
  } catch (error) { next(error); }
}

async function start(req, res, next) {
  try { res.status(201).json({ success: true, data: await assessmentService.start(req.body, tokenFor(req)) }); } catch (error) { next(error); }
}

async function answer(req, res, next) {
  try {
    const attemptId = req.params.attemptId || req.body?.attemptId || req.body?.assessmentId;
    const questionId = req.params.questionId || req.body?.questionId;
    res.json({ success: true, data: await assessmentService.answer(attemptId, questionId, req.body, tokenFor(req)) });
  } catch (error) { next(error); }
}

async function complete(req, res, next) {
  try {
    const attemptId = req.params.attemptId || req.body?.attemptId || req.body?.assessmentId;
    res.json({ success: true, data: await assessmentService.complete(attemptId, req.body, tokenFor(req)) });
  } catch (error) { next(error); }
}

module.exports = { catalog, history, report, reportPdf, start, answer, complete };
