const resumeService = require('./resume.service');

const authHeader = (req) => req.headers.authorization;
const userId = (req) => req.user?.id || req.user?.userId || req.user?.user_id;

async function getWorkspace(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.getWorkspace(userId(req), authHeader(req)) });
  } catch (error) { next(error); }
}

async function list(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.list(userId(req), authHeader(req)) });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    res.status(201).json({ success: true, data: await resumeService.create(userId(req), authHeader(req), req.body) });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.update(userId(req), req.params.resumeId, authHeader(req), req.body) });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.remove(userId(req), req.params.resumeId, authHeader(req)) });
  } catch (error) { next(error); }
}

module.exports = { getWorkspace, list, create, update, remove };
