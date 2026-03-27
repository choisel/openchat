/**
 * Estimate the number of tokens in a string
 * Uses a simple heuristic: ceil(length / 4)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Calculate the percentage of context used
 * Returns a value clamped between 0 and 100
 */
export function contextPercent(used: number, total: number): number {
  if (total === 0) {
    return 100
  }
  const percent = (used / total) * 100
  return Math.max(0, Math.min(100, percent))
}

/**
 * Get the color for a context percentage
 * - #636366 below 70% (normal)
 * - #ff9f0a at 70-89% (warning)
 * - #ff453a at 90%+ (critical)
 */
export function contextColor(percent: number): string {
  if (percent < 70) {
    return '#636366'
  }
  if (percent < 90) {
    return '#ff9f0a'
  }
  return '#ff453a'
}
