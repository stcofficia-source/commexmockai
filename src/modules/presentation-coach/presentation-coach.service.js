const OpenAI = require('openai');
const env = require('../../config/env');
const { AIServiceError, ValidationError } = require('../../core/errors');
const { captureOpenAiUsage } = require('../../core/ai-usage-cost.service');

const verdicts = ['excellent', 'good', 'needs_work', 'poor'];
const priorities = ['high', 'medium', 'low'];
const categories = ['content', 'structure', 'readability', 'visuals', 'delivery', 'accessibility'];

const suggestionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'priority', 'title', 'detail'],
  properties: {
    category: { type: 'string', enum: categories },
    priority: { type: 'string', enum: priorities },
    title: { type: 'string' },
    detail: { type: 'string' },
  },
};

const feedbackSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'overallScore',
    'verdict',
    'audienceTakeaway',
    'scores',
    'strengths',
    'suggestions',
    'speakerNotes',
    'slides',
  ],
  properties: {
    summary: { type: 'string' },
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: verdicts },
    audienceTakeaway: { type: 'string' },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: ['clarity', 'structure', 'engagement', 'visualStory', 'readability', 'consistency'],
      properties: {
        clarity: { type: 'integer', minimum: 0, maximum: 100 },
        structure: { type: 'integer', minimum: 0, maximum: 100 },
        engagement: { type: 'integer', minimum: 0, maximum: 100 },
        visualStory: { type: 'integer', minimum: 0, maximum: 100 },
        readability: { type: 'integer', minimum: 0, maximum: 100 },
        consistency: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
    strengths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slide', 'category', 'priority', 'title', 'detail'],
        properties: {
          slide: { type: 'integer', minimum: 0 },
          category: { type: 'string', enum: categories },
          priority: { type: 'string', enum: priorities },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
      minItems: 1,
      maxItems: 10,
    },
    speakerNotes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
    slides: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'number',
          'title',
          'score',
          'verdict',
          'summary',
          'contentDensity',
          'strengths',
          'suggestions',
        ],
        properties: {
          number: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          verdict: { type: 'string', enum: verdicts },
          summary: { type: 'string' },
          contentDensity: { type: 'string', enum: ['concise', 'balanced', 'dense'] },
          strengths: { type: 'array', items: { type: 'string' }, maxItems: 2 },
          suggestions: { type: 'array', items: suggestionSchema, maxItems: 2 },
        },
      },
    },
  },
};

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeSlides(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new ValidationError('Add presentation slide content before analysis.');
  }

  if (value.length > 50) {
    throw new ValidationError('A presentation can contain no more than 50 slides.');
  }

  return value.map((slide, index) => ({
    number: Math.max(1, integer(slide?.number) || index + 1),
    title: String(slide?.title || `Slide ${index + 1}`).trim().slice(0, 240),
    text: String(slide?.text || '').trim().slice(0, 4000),
    wordCount: integer(slide?.wordCount),
    textBlockCount: integer(slide?.textBlockCount),
    imageCount: integer(slide?.imageCount),
    chartCount: integer(slide?.chartCount),
    tableCount: integer(slide?.tableCount),
    hasSpeakerNotes: Boolean(slide?.hasSpeakerNotes),
  }));
}

function formatSlides(slides) {
  let remaining = 36000;
  return slides.map((slide) => {
    const safeText = slide.text.slice(0, Math.max(0, remaining));
    remaining -= safeText.length;
    return [
      `SLIDE ${slide.number}: ${slide.title}`,
      `Signals: ${slide.wordCount} words; ${slide.textBlockCount} text blocks; `
        + `${slide.imageCount} images; ${slide.chartCount} charts; ${slide.tableCount} tables; `
        + `speaker notes ${slide.hasSpeakerNotes ? 'present' : 'not detected'}.`,
      `Extracted text: ${safeText || '[No extractable text]'}`,
    ].join('\n');
  }).join('\n\n');
}

function normalizeFeedback(feedback, sourceSlides) {
  const byNumber = new Map(
    (Array.isArray(feedback?.slides) ? feedback.slides : [])
      .map((slide) => [integer(slide?.number), slide]),
  );

  return {
    ...feedback,
    slides: sourceSlides.map((source) => {
      const reviewed = byNumber.get(source.number);
      if (!reviewed) {
        throw new AIServiceError(
          `Presentation AI did not return feedback for slide ${source.number}. Please run the analysis again.`,
        );
      }
      return {
        ...reviewed,
        number: source.number,
        title: String(reviewed.title || source.title).trim() || source.title,
      };
    }),
  };
}

async function analyze(slideInput) {
  if (!env.OPENAI_API_KEY) {
    throw new AIServiceError('Presentation AI is unavailable until OPENAI_API_KEY is configured.');
  }

  const slides = normalizeSlides(slideInput);
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: env.OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_PRESENTATION_MODEL,
    temperature: 0.15,
    max_completion_tokens: env.OPENAI_PRESENTATION_MAX_OUTPUT_TOKENS,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'presentation_coach_feedback',
        strict: true,
        schema: feedbackSchema,
      },
    },
    messages: [
      {
        role: 'system',
        content: [
          'You are COMMEX AI, an expert presentation coach.',
          'Review every supplied slide and return one slides[] entry for every input slide, in the same order.',
          'Judge clarity, story, structure, audience value, readability risk, delivery readiness, and accessibility.',
          'The input contains extracted text and structural counts, not rendered pixels.',
          'Never claim to have inspected exact colors, fonts, image quality, alignment, animations, or live delivery.',
          'You may flag a likely visual/readability risk only when the structural signals support it, and state it as a risk.',
          'Be specific, constructive, concise, and suitable for a student or early-career presenter.',
          'For each slide use a short summary and return zero to two high-value, actionable suggestions only; do not invent filler feedback.',
          'For a 50-slide deck, prioritise concise guidance so every supplied slide still receives a useful result.',
          'Use slide=0 for recommendations that apply to the whole deck.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Analyze this ${slides.length}-slide deck and provide the complete structured review.\n\n${formatSlides(slides)}`,
      },
    ],
  });
  captureOpenAiUsage(completion, env.OPENAI_PRESENTATION_MODEL);

  let feedback;
  try {
    feedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
  } catch {
    throw new AIServiceError('Presentation AI returned an unreadable review. Please try again.');
  }

  return {
    feedback: normalizeFeedback(feedback, slides),
    provider: 'openai',
    model: env.OPENAI_PRESENTATION_MODEL,
  };
}

module.exports = { analyze, normalizeSlides };
