const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const env = require('../config/env');
const { getUsdInrExchangeRate } = require('./exchange-rate.service');

const usageStorage = new AsyncLocalStorage();
let pricingCatalog;

function operationalError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function loadPricingCatalog() {
  if (pricingCatalog) return pricingCatalog;

  try {
    if (env.AI_PROVIDER_PRICING_JSON) {
      pricingCatalog = JSON.parse(env.AI_PROVIDER_PRICING_JSON);
    } else {
      const configuredPath = env.AI_PROVIDER_PRICING_PATH
        ? path.resolve(env.AI_PROVIDER_PRICING_PATH)
        : path.join(__dirname, '../config/ai-provider-pricing.json');
      pricingCatalog = JSON.parse(fs.readFileSync(configuredPath, 'utf8'));
    }
  } catch (error) {
    throw operationalError(`AI provider pricing configuration is invalid: ${error.message}`);
  }

  if (!pricingCatalog?.billingCurrency || !pricingCatalog?.providers) {
    throw operationalError('AI provider pricing configuration is incomplete.');
  }
  return pricingCatalog;
}

function normalizeOpenAiUsage(response, modelOverride = '') {
  const usage = response?.usage;
  if (!usage || !response?.id) return null;

  const promptTokens = finiteNonNegative(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = finiteNonNegative(usage.completion_tokens ?? usage.output_tokens);
  const cachedPromptTokens = Math.min(
    promptTokens,
    finiteNonNegative(
      usage.prompt_tokens_details?.cached_tokens
      ?? usage.input_tokens_details?.cached_tokens,
    ),
  );

  return {
    requestId: String(response.id),
    provider: 'openai',
    model: String(modelOverride || response.model || '').trim(),
    promptTokens,
    cachedPromptTokens,
    completionTokens,
  };
}

function captureOpenAiUsage(response, modelOverride = '') {
  const normalized = normalizeOpenAiUsage(response, modelOverride);
  const collector = usageStorage.getStore();
  if (normalized && collector) collector.push(normalized);
  return normalized;
}

async function collectAiUsage(operation) {
  const usages = [];
  try {
    const data = await usageStorage.run(usages, operation);
    return { data, usages };
  } catch (error) {
    Object.defineProperty(error, 'aiUsages', {
      configurable: true,
      enumerable: false,
      value: usages,
    });
    throw error;
  }
}

function convertCurrency(amount, sourceCurrency, targetCurrency, catalog) {
  if (sourceCurrency === targetCurrency) return amount;

  if (sourceCurrency === 'USD' && targetCurrency === 'INR') {
    const configuredFallback = finiteNonNegative(catalog.exchangeRates?.USD_INR) || 96.1856;
    const liveRate = getUsdInrExchangeRate(configuredFallback);
    return amount * liveRate;
  }

  const directRate = finiteNonNegative(catalog.exchangeRates?.[`${sourceCurrency}_${targetCurrency}`]);
  if (directRate > 0) return amount * directRate;

  const inverseRate = finiteNonNegative(catalog.exchangeRates?.[`${targetCurrency}_${sourceCurrency}`]);
  if (inverseRate > 0) return amount / inverseRate;

  throw operationalError(`No ${sourceCurrency}/${targetCurrency} exchange rate is configured for AI billing.`);
}

function priceAiUsage(usage) {
  const catalog = loadPricingCatalog();
  const modelRate = catalog.providers?.[usage.provider]?.models?.[usage.model];
  if (!modelRate) {
    throw operationalError(`No AI billing price is configured for ${usage.provider}/${usage.model}.`);
  }

  const promptTokens = finiteNonNegative(usage.promptTokens);
  const cachedPromptTokens = Math.min(promptTokens, finiteNonNegative(usage.cachedPromptTokens));
  const uncachedPromptTokens = promptTokens - cachedPromptTokens;
  const completionTokens = finiteNonNegative(usage.completionTokens);

  const providerCost = (
    (uncachedPromptTokens * finiteNonNegative(modelRate.inputPerMillion))
    + (cachedPromptTokens * finiteNonNegative(modelRate.cachedInputPerMillion))
    + (completionTokens * finiteNonNegative(modelRate.outputPerMillion))
  ) / 1_000_000;

  const billingCost = convertCurrency(
    providerCost,
    String(modelRate.currency || catalog.billingCurrency).toUpperCase(),
    String(catalog.billingCurrency).toUpperCase(),
    catalog,
  );

  return {
    ...usage,
    providerCost: Number(providerCost.toFixed(8)),
    actualProviderCost: Number(billingCost.toFixed(6)),
    currency: String(catalog.billingCurrency).toUpperCase(),
    pricingVersion: String(catalog.version || ''),
    pricingEffectiveAt: String(catalog.effectiveAt || ''),
  };
}

function resetPricingCatalogForTests() {
  pricingCatalog = undefined;
}

module.exports = {
  captureOpenAiUsage,
  collectAiUsage,
  normalizeOpenAiUsage,
  priceAiUsage,
  resetPricingCatalogForTests,
};
