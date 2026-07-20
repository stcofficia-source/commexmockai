const resumeService = require('./resume.service');

const authHeader = (req) => req.headers.authorization;

async function getWorkspace(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.getWorkspace(authHeader(req)) });
  } catch (error) { next(error); }
}

async function list(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.list(authHeader(req)) });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    res.status(201).json({ success: true, data: await resumeService.create(authHeader(req), req.body) });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.update(req.params.resumeId, authHeader(req), req.body) });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    res.json({ success: true, data: await resumeService.remove(req.params.resumeId, authHeader(req)) });
  } catch (error) { next(error); }
}

module.exports = { getWorkspace, list, create, update, remove };
