/**
 * Official pricing calculator.
 *
 * This module intentionally avoids third-party pricing caches. Rates are copied
 * from provider-owned pricing pages and are expressed as USD per 1M tokens.
 * Unknown or research-preview models return 0 and are reported as unpriced.
 */

const MTOK = 1_000_000;
const VERIFIED_AT = '2026-06-11';
const DEFAULT_ANTHROPIC_CACHE_WRITE_TTL = '5m';

export const OFFICIAL_PRICING_SOURCES = [
  {
    provider: 'openai',
    label: 'OpenAI API pricing',
    url: 'https://developers.openai.com/api/docs/pricing',
    note: 'Standard API rates; Batch, Flex, Priority, long-context and data residency modifiers are not applied by default.'
  },
  {
    provider: 'openai-codex',
    label: 'OpenAI Codex pricing',
    url: 'https://developers.openai.com/codex/pricing',
    note: 'Codex ChatGPT-plan credits are documented separately; API-key mode uses OpenAI API pricing.'
  },
  {
    provider: 'anthropic',
    label: 'Claude API pricing',
    url: 'https://platform.claude.com/docs/en/about-claude/pricing',
    note: 'First-party Claude API global standard pricing; cache write defaults to 5-minute prompt caching.'
  },
  {
    provider: 'deepseek',
    label: 'DeepSeek Models & Pricing',
    url: 'https://api-docs.deepseek.com/quick_start/pricing',
    note: 'Overseas USD API prices per 1M tokens.'
  },
  {
    provider: 'xiaomi',
    label: 'Xiaomi MiMo API pricing',
    url: 'https://platform.xiaomimimo.com/docs/en-US/price/pay-as-you-go',
    note: 'Overseas USD API prices per 1M tokens.'
  }
];

export const OFFICIAL_PRICE_TABLE = [
  officialRate({
    provider: 'openai',
    model: 'gpt-5.5',
    aliases: ['gpt-5.5'],
    input: 5,
    cachedInput: 0.5,
    output: 30,
    source: 'openai',
    note: 'OpenAI API standard short-context rate.'
  }),
  officialRate({
    provider: 'openai',
    model: 'gpt-5.3-codex',
    aliases: ['gpt-5.3-codex'],
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: 'openai',
    note: 'OpenAI API standard Codex model rate.'
  }),
  officialRate({
    provider: 'openai',
    model: 'gpt-5.3-codex-spark',
    aliases: ['gpt-5.3-codex-spark'],
    source: 'openai-codex',
    unavailableReason: 'OpenAI Codex docs list GPT-5.3-Codex-Spark as research preview and do not publish a USD API token rate.'
  }),

  officialRate({
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    aliases: ['claude-opus-4-8'],
    input: 5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    cachedInput: 0.5,
    output: 25,
    source: 'anthropic'
  }),
  officialRate({
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    aliases: ['claude-opus-4-7'],
    input: 5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    cachedInput: 0.5,
    output: 25,
    source: 'anthropic'
  }),
  officialRate({
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    aliases: ['claude-opus-4-6'],
    input: 5,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    cachedInput: 0.5,
    output: 25,
    source: 'anthropic'
  }),
  officialRate({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    aliases: ['claude-sonnet-4-6'],
    input: 3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    cachedInput: 0.3,
    output: 15,
    source: 'anthropic'
  }),
  officialRate({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    aliases: ['claude-haiku-4-5'],
    input: 1,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2,
    cachedInput: 0.1,
    output: 5,
    source: 'anthropic'
  }),

  officialRate({
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    aliases: ['deepseek-v4-pro'],
    input: 0.435,
    cachedInput: 0.003625,
    output: 0.87,
    source: 'deepseek'
  }),
  officialRate({
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    aliases: ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
    input: 0.14,
    cachedInput: 0.0028,
    output: 0.28,
    source: 'deepseek',
    note: 'DeepSeek docs state deepseek-chat and deepseek-reasoner map to deepseek-v4-flash compatibility modes.'
  }),

  officialRate({
    provider: 'xiaomi',
    model: 'mimo-v2.5-pro',
    aliases: ['mimo-v2.5-pro'],
    input: 0.435,
    cachedInput: 0.0036,
    output: 0.87,
    source: 'xiaomi'
  }),
  officialRate({
    provider: 'xiaomi',
    model: 'mimo-v2.5',
    aliases: ['mimo-v2.5'],
    input: 0.14,
    cachedInput: 0.0028,
    output: 0.28,
    source: 'xiaomi'
  })
];

/**
 * Kept for the collector API shape. No network or third-party cache is used.
 */
export async function loadPricing() {
  return {
    mode: 'official-docs',
    verifiedAt: VERIFIED_AT,
    sources: OFFICIAL_PRICING_SOURCES,
    models: OFFICIAL_PRICE_TABLE
  };
}

export function calculateCost(model, tokens, _pricingData = null, provider = null) {
  return calculateOfficialCost(model, tokens, { provider }).totalUSD;
}

export function calculateOfficialCost(model, tokens = {}, options = {}) {
  const pricing = resolveOfficialPricing(model, options.provider);
  const normalizedTokens = normalizeTokens(tokens);

  if (!pricing || !pricing.priced) {
    return {
      model: normalizeModelId(model),
      resolvedModel: pricing?.model || null,
      provider: pricing?.provider || null,
      priced: false,
      status: pricing?.unavailableReason ? 'unpriced' : 'unknown-model',
      reason: pricing?.unavailableReason || 'No official USD token price is configured for this model.',
      tokens: normalizedTokens,
      ratesPerMTok: null,
      totalUSD: 0,
      source: pricing?.source || null
    };
  }

  const cacheWriteMode = normalizeAnthropicCacheWriteTtl(options.anthropicCacheWriteTtl);
  const rates = ratesForCalculation(pricing.ratesPerMTok, pricing.provider, cacheWriteMode);
  const outputTokens = normalizedTokens.output + normalizedTokens.reasoning;
  const inputUSD = costPart(normalizedTokens.input, rates.input);
  const cachedInputUSD = costPart(normalizedTokens.cacheRead, rates.cachedInput);
  const cacheWriteUSD = costPart(normalizedTokens.cacheWrite, rates.cacheWrite);
  const outputUSD = costPart(outputTokens, rates.output);

  return {
    model: normalizeModelId(model),
    resolvedModel: pricing.model,
    provider: pricing.provider,
    priced: true,
    status: 'priced',
    reason: null,
    tokens: normalizedTokens,
    ratesPerMTok: rates,
    parts: {
      inputUSD,
      cachedInputUSD,
      cacheWriteUSD,
      outputUSD
    },
    totalUSD: inputUSD + cachedInputUSD + cacheWriteUSD + outputUSD,
    source: pricing.source,
    note: pricing.note || null
  };
}

export function resolveOfficialPricing(model, provider = null) {
  const normalized = normalizeModelId(model);
  if (!normalized || normalized === '<synthetic>') return null;

  const candidates = modelCandidates(normalized, provider);
  const sorted = OFFICIAL_PRICE_TABLE
    .slice()
    .sort((a, b) => longestAliasLength(b) - longestAliasLength(a));

  for (const rate of sorted) {
    if (matchesRate(rate, candidates)) return rate;
  }

  return null;
}

export function officialPricingMetadata(rows = []) {
  const byModel = new Map();
  let totalTokens = 0;
  let pricedTokens = 0;
  let pricedCostUSD = 0;

  for (const row of rows) {
    const tokens = tokenTotal(row);
    totalTokens += tokens;
    const cost = Number(row.costUSD || 0);
    const priced = row.pricingStatus === 'priced' || cost > 0;
    if (priced) {
      pricedTokens += tokens;
      pricedCostUSD += cost;
      continue;
    }
    const model = row.model || row.pricingModel || 'unknown';
    const current = byModel.get(model) || { model, totalTokens: 0, rows: 0, reason: row.pricingReason || 'No official USD price.' };
    current.totalTokens += tokens;
    current.rows += 1;
    byModel.set(model, current);
  }

  return {
    mode: 'official-price-conversion',
    currency: 'USD',
    verifiedAt: VERIFIED_AT,
    totalTokens,
    pricedTokens,
    unpricedTokens: Math.max(0, totalTokens - pricedTokens),
    pricedShare: totalTokens ? pricedTokens / totalTokens : 1,
    pricedCostUSD,
    sources: OFFICIAL_PRICING_SOURCES,
    unpricedModels: Array.from(byModel.values())
      .sort((a, b) => b.totalTokens - a.totalTokens)
  };
}

export function attachOfficialPricing(row, model = row?.model, provider = null) {
  const tokens = {
    input: row?.inputTokens ?? row?.input,
    output: row?.outputTokens ?? row?.output,
    cacheRead: row?.cacheReadTokens ?? row?.cacheRead,
    cacheWrite: row?.cacheCreationTokens ?? row?.cacheWrite,
    reasoning: row?.reasoningOutputTokens ?? row?.reasoning
  };
  const cost = calculateOfficialCost(model, tokens, { provider });
  return {
    ...row,
    costUSD: cost.totalUSD,
    pricingStatus: cost.status,
    pricingModel: cost.resolvedModel || cost.model || model || null,
    pricingProvider: cost.provider || null,
    pricingReason: cost.reason || null,
    pricingSource: cost.source?.url || null,
    pricingSourceLabel: cost.source?.label || null
  };
}

function officialRate({
  provider,
  model,
  aliases,
  input,
  cachedInput,
  cacheWrite5m,
  cacheWrite1h,
  output,
  source,
  note,
  unavailableReason
}) {
  const sourceMeta = OFFICIAL_PRICING_SOURCES.find(item => item.provider === source) || null;
  const priced = input != null && output != null && !unavailableReason;
  return {
    provider,
    model,
    aliases: aliases.map(normalizeModelId),
    priced,
    unavailableReason: unavailableReason || null,
    ratesPerMTok: priced ? {
      input: Number(input),
      cachedInput: Number(cachedInput ?? input),
      cacheWrite5m: Number(cacheWrite5m ?? input),
      cacheWrite1h: Number(cacheWrite1h ?? cacheWrite5m ?? input),
      output: Number(output)
    } : null,
    source: sourceMeta,
    note: note || sourceMeta?.note || null
  };
}

function ratesForCalculation(rates, provider, cacheWriteMode) {
  return {
    input: validRate(rates.input),
    cachedInput: validRate(rates.cachedInput),
    cacheWrite: validRate(
      provider === 'anthropic' && cacheWriteMode === '1h'
        ? rates.cacheWrite1h
        : rates.cacheWrite5m
    ),
    output: validRate(rates.output)
  };
}

function normalizeAnthropicCacheWriteTtl(value = process.env.ANTHROPIC_CACHE_WRITE_TTL) {
  const normalized = String(value || DEFAULT_ANTHROPIC_CACHE_WRITE_TTL).trim().toLowerCase();
  return normalized === '1h' || normalized === 'hour' || normalized === '3600' ? '1h' : '5m';
}

function modelCandidates(model, provider) {
  const normalized = normalizeModelId(model);
  const bare = normalized.split('/').at(-1);
  const values = [
    normalized,
    bare,
    normalizeVersionSeparator(normalized),
    normalizeVersionSeparator(bare)
  ].filter(Boolean);
  const providerHint = normalizeProvider(provider);
  if (providerHint) {
    values.push(`${providerHint}/${bare}`);
  }
  return Array.from(new Set(values));
}

function matchesRate(rate, candidates) {
  return candidates.some(candidate =>
    rate.aliases.some(alias =>
      candidate === alias ||
      candidate.startsWith(`${alias}-`) ||
      candidate.startsWith(`${alias}:`)
    )
  );
}

function longestAliasLength(rate) {
  return Math.max(...rate.aliases.map(alias => alias.length));
}

function normalizeTokens(tokens = {}) {
  return {
    input: positive(tokens.input),
    output: positive(tokens.output),
    cacheRead: positive(tokens.cacheRead ?? tokens.cache_read),
    cacheWrite: positive(tokens.cacheWrite ?? tokens.cache_write),
    reasoning: positive(tokens.reasoning)
  };
}

function tokenTotal(row = {}) {
  return positive(row.totalTokens ?? row.total_tokens)
    || positive(row.inputTokens) + positive(row.outputTokens)
      + positive(row.cacheReadTokens) + positive(row.cacheCreationTokens)
      + positive(row.reasoningOutputTokens);
}

function costPart(tokens, ratePerMTok) {
  return positive(tokens) * validRate(ratePerMTok) / MTOK;
}

function validRate(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function positive(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function normalizeModelId(value) {
  return String(value || '').trim().toLowerCase().replace(/(?<=\d)\.(?=\d)/g, '-');
}

function normalizeVersionSeparator(id) {
  const text = String(id || '');
  const normalized = text.replace(/(?<=\d)\.(?=\d)/g, '-');
  return normalized === text ? null : normalized;
}
