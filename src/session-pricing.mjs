import { calculateOfficialCost } from './pricing.mjs';

// A session can contain several models. Price its complete event history by
// model before summing; a model suffix in a legacy session ID is not evidence
// that every request used that model. This helper never writes to SQLite.
export function priceSessionRows(db, sessions) {
  const groups = db.prepare(`SELECT device, source, session_id AS sessionId, model,
    SUM(input_tokens) AS input, SUM(output_tokens) AS output,
    SUM(cache_read_tokens) AS cacheRead, SUM(cache_creation_tokens) AS cacheWrite,
    SUM(reasoning_tokens) AS reasoning
    FROM token_events GROUP BY device, source, session_id, model`).all();
  const bySession = new Map();
  for (const row of groups) {
    const key = identity(row);
    const current = bySession.get(key) || { models: [], tokens: 0, costUSD: 0, priced: true };
    const price = calculateOfficialCost(row.model, row);
    current.models.push(row.model);
    current.tokens += row.input + row.output + row.cacheRead + row.cacheWrite + row.reasoning;
    current.costUSD += price.totalUSD;
    current.priced &&= price.priced;
    bySession.set(key, current);
  }
  return sessions.map(session => {
    const history = bySession.get(identity(session));
    if (!history || history.tokens !== Number(session.totalTokens || 0)) {
      return {
        ...session,
        costUSD: Number(session.costUSD || 0),
        pricingStatus: 'unverified-aggregate',
        pricingReason: 'Complete event history is unavailable; the recorded aggregate cost is retained without repricing it as a single model.'
      };
    }
    return {
      ...session,
      model: history.models.length === 1 ? history.models[0] : 'mixed',
      models: history.models,
      costUSD: history.costUSD,
      pricingStatus: history.priced ? 'priced' : 'partial',
      pricingModel: history.models.length === 1 ? history.models[0] : 'mixed',
      pricingReason: history.priced ? null : 'Some event models do not have an official configured price.'
    };
  });
}

function identity(row) {
  return JSON.stringify([row.device, row.source, row.sessionId]);
}
