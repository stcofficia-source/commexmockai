/**
 * Centralized OpenAI Client & Execution Utility
 * Shared by all feature modules in stcmockai (Interview, Mentor, Presentation Coach, Critique, Resume, TTS).
 * Centralizes client initialization, error handling, and token credit usage tracking.
 */
const OpenAI = require('openai');
const env = require('../config/env');
const logger = require('./logger');
const { captureOpenAiUsage } = require('./ai-usage-cost.service');
const { AIServiceError } = require('./errors');

let openaiInstance = null;

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    throw new AIServiceError('OpenAI API key is missing. Please configure OPENAI_API_KEY.');
  }

  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_REQUEST_TIMEOUT_MS || 120000,
      maxRetries: env.OPENAI_MAX_RETRIES || 2,
    });
  }

  return openaiInstance;
}

/**
 * Unified Chat Completion Helper with automatic token tracking
 */
async function createChatCompletion({
  model,
  messages,
  temperature = 0.7,
  responseFormat,
  maxTokens,
  modelOverride,
  timeout = 120000,
}) {
  const client = getOpenAIClient();
  const selectedModel = model || env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const completion = await client.chat.completions.create(
      {
        model: selectedModel,
        messages,
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      },
      { timeout },
    );

    captureOpenAiUsage(completion, modelOverride || selectedModel);
    return completion;
  } catch (err) {
    logger.error({ err: err.message, status: err.status, model: selectedModel }, 'OpenAI Chat Completion error');
    throw new AIServiceError(`AI service call failed: ${err.message}`);
  }
}

/**
 * Unified Speech Generation Helper (TTS)
 */
async function createSpeech({
  model = 'tts-1',
  voice = 'nova',
  input,
  speed = 0.95,
  responseFormat = 'mp3',
}) {
  const client = getOpenAIClient();
  try {
    return await client.audio.speech.create({
      model,
      voice,
      input,
      speed,
      response_format: responseFormat,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'OpenAI Speech Creation error');
    throw new AIServiceError(`AI speech creation failed: ${err.message}`);
  }
}

module.exports = {
  getOpenAIClient,
  createChatCompletion,
  createSpeech,
};
