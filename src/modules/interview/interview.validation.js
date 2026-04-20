/**
 * Interview Validation Schemas
 */
const { z } = require('zod');

const getRolesSchema = z.object({
  id: z.string().or(z.number()),
});

const getHistorySchema = z.object({
  page: z.string().optional().transform(v => parseInt(v, 10) || 1),
  limit: z.string().optional().transform(v => parseInt(v, 10) || 20),
});

const uploadAudioSchema = z.object({
  sessionId: z.string().min(10),
  fallbackText: z.string().optional(),
});

module.exports = {
  getRolesSchema,
  getHistorySchema,
  uploadAudioSchema,
};
