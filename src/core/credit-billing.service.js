const axios = require('axios');
const env = require('../config/env');
const {
  collectAiUsage,
  priceAiUsage,
} = require('./ai-usage-cost.service');

function creditError(error) {
  const wrapped = new Error(error.response?.data?.message || 'AI credit service is unavailable.');
  wrapped.statusCode = error.response?.status || 503;
  wrapped.isOperational = true;
  return wrapped;
}

function requireAuthorization(authorization) {
  if (!authorization) {
    const error = new Error('Authentication is required to use AI services.');
    error.statusCode = 401;
    error.isOperational = true;
    throw error;
  }
}

async function assertAiCreditAccess(authorization) {
  requireAuthorization(authorization);
  try {
    const response = await axios.get(
      `${String(env.STC_API_BASE_URL).replace(/\/+$/, '')}/v1/credits/wallet`,
      { headers: { Authorization: authorization }, timeout: 10000 },
    );
    const payload = response.data?.data || response.data || {};
    const wallet = payload.wallet || payload;
    if (Number(wallet.credits_balance ?? wallet.credit_balance ?? wallet.balance ?? 0) <= 0) {
      const error = new Error('Insufficient credits.');
      error.statusCode = 402;
      error.isOperational = true;
      throw error;
    }
    return wallet;
  } catch (error) {
    if (error.isOperational) throw error;
    throw creditError(error);
  }
}

async function settleAiUsage({ authorization, serviceKey, usage, reference = '' }) {
  const priced = priceAiUsage(usage);
  try {
    const response = await axios.post(
      `${String(env.STC_API_BASE_URL).replace(/\/+$/, '')}/v1/credits/usage/settle`,
      {
        request_id: priced.requestId,
        service_key: serviceKey,
        reference,
        provider: priced.provider,
        model: priced.model,
        prompt_tokens: priced.promptTokens,
        completion_tokens: priced.completionTokens,
        actual_provider_cost: priced.actualProviderCost,
        currency: priced.currency,
      },
      {
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        timeout: 10000,
      },
    );
    return response.data?.data || response.data || {};
  } catch (error) {
    throw creditError(error);
  }
}

async function runBillableAiOperation({
  authorization,
  serviceKey,
  reference = '',
  operation,
}) {
  requireAuthorization(authorization);
  if (!serviceKey || typeof operation !== 'function') {
    throw new TypeError('A service key and AI operation are required for credit settlement.');
  }

  await assertAiCreditAccess(authorization);
  let result;
  let operationError;
  try {
    result = await collectAiUsage(operation);
  } catch (error) {
    operationError = error;
    result = { data: undefined, usages: error.aiUsages || [] };
  }

  if (!result.usages.length) {
    if (operationError) throw operationError;
    const error = new Error('The AI provider did not return billable usage metadata.');
    error.statusCode = 502;
    error.isOperational = true;
    throw error;
  }

  const settlements = [];
  for (const usage of result.usages) {
    settlements.push(await settleAiUsage({
      authorization,
      serviceKey,
      usage,
      reference,
    }));
  }
  if (operationError) throw operationError;
  return { data: result.data, settlements };
}

module.exports = {
  assertAiCreditAccess,
  runBillableAiOperation,
  settleAiUsage,
};
