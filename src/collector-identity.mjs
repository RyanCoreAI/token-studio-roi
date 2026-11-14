// Preserve one existing collector identity and its annotations during ordinary
// re-collection. This is not a data migration and never deletes historical rows.
export function reconcileCollectorIdentities(db, sessions, events, label = 'Codex') {
  const selectSessions = db.prepare('SELECT session_id AS sessionId FROM session_usage WHERE device = ? AND source = ?');
  const selectEvents = db.prepare(`SELECT event_id AS eventId, timestamp, model,
    input_tokens AS inputTokens, output_tokens AS outputTokens,
    cache_read_tokens AS cacheReadTokens, cache_creation_tokens AS cacheCreationTokens,
    reasoning_tokens AS reasoningTokens FROM token_events
    WHERE device = ? AND source = ? AND session_id = ?`);
  const storedBySource = new Map();
  const incomingEvents = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.device, event.source, event.sessionId]);
    const group = incomingEvents.get(key) || [];
    group.push(event);
    incomingEvents.set(key, group);
  }
  for (const session of sessions) {
    if (!session.legacySessionPrefix) continue;
    const sourceKey = JSON.stringify([session.device, session.source]);
    if (!storedBySource.has(sourceKey)) {
      const ids = new Map();
      for (const row of selectSessions.all(session.device, session.source)) {
        ids.set(row.sessionId, [row]);
        const parts = row.sessionId.split(':');
        if (parts[0] === 'local' && parts[2] !== 'v2') {
          const prefix = parts.slice(0, 3).join(':') + ':';
          const group = ids.get(prefix) || [];
          group.push(row);
          ids.set(prefix, group);
        }
      }
      storedBySource.set(sourceKey, ids);
    }
    const stored = storedBySource.get(sourceKey);
    const matching = [...(stored.get(session.sessionId) || []), ...(stored.get(session.legacySessionPrefix) || [])];
    if (matching.length > 1) {
      throw new Error(`${label} history has multiple identities for one session. Review duplicate history before applying; no historical rows were deleted.`);
    }
    if (!matching.length) continue;
    if (session.legacyIdentityLossy && matching[0].sessionId !== session.sessionId) {
      throw new Error(`${label} legacy identity cannot be matched without loss. Review history before applying; existing data was retained.`);
    }
    const stableId = session.sessionId;
    session.sessionId = matching[0].sessionId;
    const previous = selectEvents.all(session.device, session.source, session.sessionId);
    const previousIds = new Set(previous.map(old => old.eventId));
    const previousByTime = new Map();
    for (const old of previous) {
      const key = JSON.stringify([old.timestamp, old.model]);
      const group = previousByTime.get(key) || [];
      group.push(old); previousByTime.set(key, group);
    }
    for (const event of incomingEvents.get(JSON.stringify([session.device, session.source, stableId])) || []) {
      event.sessionId = session.sessionId;
      if (previousIds.has(event.eventId)) continue;
      const candidates = previousByTime.get(JSON.stringify([event.timestamp, event.model])) || [];
      const equivalent = candidates.filter(old =>
        old.inputTokens === event.inputTokens && old.cacheReadTokens === event.cacheReadTokens
        && old.cacheCreationTokens === event.cacheCreationTokens
        && ((old.reasoningTokens === event.reasoningTokens
          && (old.outputTokens === event.outputTokens || old.outputTokens === event.outputTokens + event.reasoningTokens))
          || (label === 'Claude' && old.reasoningTokens === 0 && old.outputTokens === event.outputTokens + event.reasoningTokens))
      );
      if (equivalent.length === 1) event.eventId = equivalent[0].eventId;
      else if (candidates.length) {
        throw new Error(`${label} historical event identity is ambiguous. Review history before applying; existing data was retained.`);
      }
    }
  }
}
