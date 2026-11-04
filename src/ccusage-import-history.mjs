import { calculateOfficialCost } from './pricing.mjs';

const eventColumns = `event_id AS eventId, device, source, session_id AS sessionId, timestamp, model`;
const identity = row => JSON.stringify([row.device, row.source, row.sessionId]);
const dayIdentity = row => JSON.stringify([row.device, row.source, row.timestamp.slice(0, 10), row.model]);

export function prepareImportHistory(db, plan) {
  const getSession = db.prepare('SELECT session_id FROM session_usage WHERE device = ? AND source = ? AND session_id = ?');
  for (const session of plan.sessions) {
    if (session.legacySessionId && session.legacySessionId !== session.sessionId
      && getSession.get(session.device, session.source, session.legacySessionId)) {
      throw new Error('Legacy ccusage session identity is lossy; review legacy history before applying. No historical rows were changed.');
    }
  }
  const byId = db.prepare(`SELECT ${eventColumns} FROM token_events WHERE event_id = ?`);
  const oldEvents = db.prepare(`SELECT ${eventColumns} FROM token_events WHERE device = ? AND source = ? AND session_id = ? AND model = ? AND event_id LIKE 'ccusage:%'`);
  const days = new Map();
  const shapesForDay = db.prepare(`SELECT event_id AS eventId FROM token_events WHERE device = ? AND source = ? AND substr(timestamp, 1, 10) = ? AND event_id LIKE 'ccusage:%'`);
  const events = plan.tokenEvents.map(event => {
    for (const old of shapesForDay.all(event.device, event.source, event.timestamp.slice(0, 10))) {
      const parts = old.eventId.split(':');
      const oldShape = parts[1] === 'v2' ? parts[2] : parts[1];
      if (['daily', 'project-daily', 'session', 'blocks', 'weekly', 'monthly'].includes(oldShape) && oldShape !== plan.detectedShape) {
        throw new Error('ccusage report shapes overlap on the same device/source/day; review overlapping reports before applying to avoid double counting.');
      }
    }
    const exact = byId.get(event.eventId);
    if (exact && (identity(exact) !== identity(event) || exact.model !== event.model)) {
      throw new Error('ccusage event identity conflicts with stored history; review history before applying.');
    }
    const candidates = oldEvents.all(event.device, event.source, event.sessionId, event.model)
      .filter(old => old.eventId === event.eventId || (!old.eventId.startsWith('ccusage:v2:')
        && (plan.detectedShape === 'session' || old.timestamp === event.timestamp)));
    if (candidates.length > 1) throw new Error('Legacy ccusage events are ambiguous; review legacy history before applying. No historical rows were changed.');
    const previous = exact || candidates[0];
    if (previous) days.set(dayIdentity(previous), previous);
    const resolved = { ...event, eventId: previous?.eventId || event.eventId };
    days.set(dayIdentity(resolved), resolved);
    return resolved;
  });
  return { events, days };
}

export function rebuildImportAggregates(db, plan, history, { upsertDaily, upsertSession }) {
  const priorSession = db.prepare('SELECT project_path AS projectPath FROM session_usage WHERE device = ? AND source = ? AND session_id = ?');
  const sessionEvents = db.prepare(`SELECT timestamp, model, input_tokens AS inputTokens, output_tokens AS outputTokens,
    cache_read_tokens AS cacheReadTokens, cache_creation_tokens AS cacheCreationTokens, reasoning_tokens AS reasoningOutputTokens
    FROM token_events WHERE device = ? AND source = ? AND session_id = ?`);
  const dailyEvents = db.prepare(`SELECT timestamp, model, input_tokens AS inputTokens, output_tokens AS outputTokens,
    cache_read_tokens AS cacheReadTokens, cache_creation_tokens AS cacheCreationTokens, reasoning_tokens AS reasoningOutputTokens
    FROM token_events WHERE device = ? AND source = ? AND substr(timestamp, 1, 10) = ? AND model = ?`);
  for (const session of plan.sessions) {
    const events = sessionEvents.all(session.device, session.source, session.sessionId);
    const previous = priorSession.get(session.device, session.source, session.sessionId);
    upsertSession(db, { ...session, ...sumEvents(events), projectPath: session.projectPath || previous?.projectPath || null,
      lastActivity: events.map(e => e.timestamp).sort().at(-1) || session.lastActivity });
  }
  for (const row of history.days.values()) {
    const usageDate = row.timestamp.slice(0, 10);
    upsertDaily(db, { device: row.device, source: row.source, model: row.model, usageDate,
      ...sumEvents(dailyEvents.all(row.device, row.source, usageDate, row.model)) });
  }
}

function sumEvents(events) {
  const total = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0, costUSD: 0 };
  for (const event of events) {
    for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningOutputTokens']) {
      total[key] += event[key]; total.totalTokens += event[key];
    }
    total.costUSD += calculateOfficialCost(event.model, { input: event.inputTokens, output: event.outputTokens,
      cacheRead: event.cacheReadTokens, cacheWrite: event.cacheCreationTokens, reasoning: event.reasoningOutputTokens }).totalUSD;
  }
  return total;
}
