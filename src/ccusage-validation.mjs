// Never turn malformed imported usage into a valid zero snapshot: it could
// replace an existing record. Missing buckets are allowed by ccusage formats.
export function tokenCount(value) {
  if (value == null) return 0;
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !value.trim())) {
    throw new Error('ccusage token count must be a non-negative safe integer.');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('ccusage token count must be a non-negative safe integer.');
  }
  return count;
}

export function addTokenCounts(...values) {
  let result = 0;
  for (const value of values) {
    result += tokenCount(value);
    if (!Number.isSafeInteger(result)) throw new Error('ccusage token aggregate exceeds the safe integer range.');
  }
  return result;
}
