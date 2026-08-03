const OpenAI = require('openai');
const env = require('../../config/env');
const { AIServiceError, ValidationError } = require('../../core/errors');
const { captureOpenAiUsage } = require('../../core/ai-usage-cost.service');

const verdicts = ['excellent', 'good', 'needs_work', 'poor'];
const priorities = ['high', 'medium', 'low'];
const categories = ['content', 'structure', 'readability', 'visuals', 'delivery', 'accessibility'];
const visualTypes = ['diagram', 'chart', 'table', 'timeline', 'screenshot', 'comparison', 'process', 'none', 'other'];

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
    'deckPlan',
    'slides',
  ],
  properties: {
    summary: { type: 'string' },
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: verdicts },
    audienceTakeaway: { type: 'string' },
    deckPlan: {
      type: 'object',
      additionalProperties: false,
      required: ['presentationTitle', 'subtitle', 'openingMessage', 'projectNarrative', 'sections', 'missingContext'],
      properties: {
        presentationTitle: { type: 'string' },
        subtitle: { type: 'string' },
        openingMessage: { type: 'string' },
        projectNarrative: { type: 'string' },
        sections: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sectionTitle', 'purpose', 'slideNumbers'],
            properties: {
              sectionTitle: { type: 'string' },
              purpose: { type: 'string' },
              slideNumbers: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'integer', minimum: 1 } },
            },
          },
        },
        missingContext: { type: 'string' },
      },
    },
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
          'suggestedTitle',
          'slidePurpose',
          'contentPlan',
          'visualPlan',
          'speakerNotes',
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
          suggestedTitle: { type: 'string' },
          slidePurpose: { type: 'string' },
          contentPlan: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string' } },
          visualPlan: {
            type: 'object',
            additionalProperties: false,
            required: ['visualType', 'title', 'description', 'dataNeeded'],
            properties: {
              visualType: { type: 'string', enum: visualTypes },
              title: { type: 'string' },
              description: { type: 'string' },
              dataNeeded: { type: 'string' },
            },
          },
          speakerNotes: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
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
    imageUrl: String(slide?.imageUrl || '').trim(),
    wordCount: integer(slide?.wordCount),
    textBlockCount: integer(slide?.textBlockCount),
    imageCount: integer(slide?.imageCount),
    chartCount: integer(slide?.chartCount),
    tableCount: integer(slide?.tableCount),
    hasSpeakerNotes: Boolean(slide?.hasSpeakerNotes),
  }));
}

function normalizeProjectContext(value) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, 8000);
}

function formatSlides(slides) {
  let remaining = 36000;
  return slides.map((slide) => {
    const safeText = slide.text.slice(0, Math.max(0, remaining));
    remaining -= safeText.length;
    const hasVisuals = slide.imageCount > 0 || slide.textBlockCount > 0 || slide.imageUrl || /Visual Graphic/i.test(safeText);
    const displayText = safeText || (hasVisuals ? '[Visual Graphic Slide: Slide contains graphics, visual design assets, and layout elements.]' : '[No extractable text]');
    return [
      `SLIDE ${slide.number}: ${slide.title}`,
      `Signals: ${slide.wordCount} words; ${slide.textBlockCount} text blocks; `
        + `${slide.imageCount} images; ${slide.chartCount} charts; ${slide.tableCount} tables; `
        + `speaker notes ${slide.hasSpeakerNotes ? 'present' : 'not detected'}.`,
      `Extracted content: ${displayText}`,
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
        title: (() => {
          const title = String(reviewed.title || '').trim();
          return title && !/^\d+$/.test(title) ? title : source.title;
        })(),
      };
    }),
  };
}

async function analyze(slideInput, projectContext = '') {
  if (!env.OPENAI_API_KEY) {
    throw new AIServiceError('Presentation AI is unavailable until OPENAI_API_KEY is configured.');
  }

  const slides = normalizeSlides(slideInput);
  const context = normalizeProjectContext(projectContext);
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    timeout: env.OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
  });

  const userMessageContent = [
    {
      type: 'text',
      text: `Analyze this ${slides.length}-slide deck and provide the complete structured review.\n\nPROJECT CONTEXT:\n${context || '[No project context was supplied. Use placeholders for details the deck does not establish.]'}\n\nSLIDES:\n${formatSlides(slides)}`,
    },
  ];

  // Include slide visual images for OpenAI GPT-4o Vision OCR & Visual layout analysis
  slides.forEach((slide) => {
    if (slide.imageUrl && slide.imageUrl.startsWith('data:image/')) {
      userMessageContent.push({
        type: 'image_url',
        image_url: {
          url: slide.imageUrl,
          detail: 'low',
        },
      });
    }
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
          'You are COMMEX AI, an expert presentation coach with vision capability and professional technical documentation expertise.',
          'Review every supplied slide and return one slides[] entry for every input slide, in the same order.',
          'Analyze and fix all grammar mistakes, spelling typos, awkward phrasing, and clarity issues in the slide copy.',
          'When slide images or visual graphic assets are attached, use Vision OCR to read slide titles, headings, body text, and visual layout.',
          'The extracted slide text and visual image evidence are the primary project evidence.',
          'Do not infer that a slide has no visuals or text when slide images or graphic layout signals exist.',
          'Never score a slide 0 or call it completely blank when images, text blocks, or visual graphic assets are present.',
          'Create an extensive, professional, project-related presentation blueprint. For every slide, provide 3 to 6 comprehensive, ready-to-paste improved slide bullet points (contentPlan), a compelling suggested title, clear audience purpose, visual plan, and detailed speaker guidance.',
          'Every contentPlan item must be complete, high-quality, professional audience-facing slide copy with zero grammar or spelling errors. It must not be a task or instruction and must not begin with Add, Include, Define, Explain, Outline, Describe, Show, Use, Provide, Consider, or Discuss.',
          'All returned text must be clear, flawless, professional technical English.',
          'Ground every contentPlan item, summary, strength, and recommendation in the slide text, visual image evidence, or verified project context.',
          'Use these scoring anchors consistently: 0–20 only for blank or corrupt slides; 21–49 for substantially incomplete slides; 50–69 for understandable slides with material gaps; 70–84 for good slides; 85–100 for excellent, presentation-ready slides.',
          'The slide summary must begin with what the slide communicates, note any grammar or structural corrections, and then identify the most important evidence-based gap.',
          'Use slide=0 for recommendations that apply to the whole deck.',
        ].join(' '),
      },
      {
        role: 'user',
        content: userMessageContent,
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

module.exports = { analyze, normalizeProjectContext, normalizeSlides };
