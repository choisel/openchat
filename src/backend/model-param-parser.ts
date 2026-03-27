/**
 * Extracts a parameter count (in billions) from a model id string.
 *
 * Supported patterns (case-insensitive):
 *   - Simple:   "7b"  → 7
 *   - Decimal:  "6.7b" → 6.7
 *   - MoE:      "8x7b" → 56  (N × M)
 *
 * Returns Infinity for unrecognised ids so they sort last when
 * selecting the smallest available model.
 */
export function parseParamCount(modelId: string): number {
  const lower = modelId.toLowerCase()

  // MoE pattern: NxMb  (e.g. 8x7b)
  const moeMatch = lower.match(/(\d+)x(\d+(?:\.\d+)?)b/)
  if (moeMatch) {
    return parseFloat(moeMatch[1]) * parseFloat(moeMatch[2])
  }

  // Simple / decimal pattern: 6.7b or 7b
  const simpleMatch = lower.match(/(\d+(?:\.\d+)?)b/)
  if (simpleMatch) {
    return parseFloat(simpleMatch[1])
  }

  return Infinity
}
