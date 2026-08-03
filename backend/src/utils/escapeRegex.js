// Escape a user-supplied string so it is treated as a literal inside a Mongo
// $regex query. Prevents ReDoS (catastrophic backtracking) and regex injection
// from search inputs.
export function escapeRegex(input) {
  return String(input == null ? '' : input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
