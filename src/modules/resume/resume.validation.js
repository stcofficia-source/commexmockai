const { z } = require('zod');

const resumeId = z.union([
  z.string().trim().min(1).max(120),
  z.number().int().nonnegative(),
  z.null(),
]).optional();

const atsReviewSchema = z.object({
  action: z.string().trim().optional(),
  force: z.boolean().optional().default(false),
  resumeId,
  title: z.string().trim().max(190).optional().default(''),
  form: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough().superRefine((payload, context) => {
  if (!payload.title && !Object.keys(payload.form).length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['form'],
      message: 'Add resume details before requesting an ATS review.',
    });
  }
});

module.exports = { atsReviewSchema };
