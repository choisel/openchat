import { describe, it, expect } from 'vitest'
import { estimateTokens, contextPercent, contextColor } from '../../src/renderer/lib/tokens'

describe('estimateTokens', () => {
  it('should estimate tokens as ceil(length / 4)', () => {
    expect(estimateTokens('hello world')).toBe(3) // 11 chars, ceil(11/4) = 3
  })

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('should handle single character', () => {
    expect(estimateTokens('a')).toBe(1) // ceil(1/4) = 1
  })

  it('should handle exact multiples of 4', () => {
    expect(estimateTokens('1234')).toBe(1) // 4 chars, ceil(4/4) = 1
    expect(estimateTokens('12345678')).toBe(2) // 8 chars, ceil(8/4) = 2
  })
})

describe('contextPercent', () => {
  it('should return percentage clamped between 0 and 100', () => {
    expect(contextPercent(50, 100)).toBe(50)
    expect(contextPercent(75, 100)).toBe(75)
  })

  it('should clamp at 0', () => {
    expect(contextPercent(-10, 100)).toBe(0)
  })

  it('should clamp at 100', () => {
    expect(contextPercent(150, 100)).toBe(100)
  })

  it('should handle 0 total gracefully', () => {
    expect(contextPercent(0, 0)).toBe(100) // or could be 0, but checking NaN doesn't occur
  })
})

describe('contextColor', () => {
  it('should return #636366 below 70', () => {
    expect(contextColor(0)).toBe('#636366')
    expect(contextColor(50)).toBe('#636366')
    expect(contextColor(69)).toBe('#636366')
  })

  it('should return #ff9f0a at 70-89', () => {
    expect(contextColor(70)).toBe('#ff9f0a')
    expect(contextColor(75)).toBe('#ff9f0a')
    expect(contextColor(89)).toBe('#ff9f0a')
  })

  it('should return #ff453a at 90+', () => {
    expect(contextColor(90)).toBe('#ff453a')
    expect(contextColor(95)).toBe('#ff453a')
    expect(contextColor(100)).toBe('#ff453a')
  })
})
