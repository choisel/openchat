import { describe, it, expect } from 'vitest'
import { parseParamCount } from '../../src/backend/model-param-parser'

describe('parseParamCount', () => {
  it('parses a simple integer billion count (2b)', () => {
    expect(parseParamCount('qwen-2b')).toBe(2)
  })

  it('parses a simple integer billion count (7b)', () => {
    expect(parseParamCount('llama-7b')).toBe(7)
  })

  it('parses a large integer billion count (70b) — llama-3-70b', () => {
    expect(parseParamCount('llama-3-70b')).toBe(70)
  })

  it('parses a decimal billion count (6.7b) — deepseek-coder-6.7b', () => {
    expect(parseParamCount('deepseek-coder-6.7b')).toBe(6.7)
  })

  it('parses a small decimal billion count (2.7b) — phi-2', () => {
    expect(parseParamCount('phi-2.7b')).toBe(2.7)
  })

  it('parses MoE notation (8x7b → 56) — mixtral-8x7b', () => {
    expect(parseParamCount('mixtral-8x7b-instruct')).toBe(56)
  })

  it('parses MoE notation (8x22b → 176) — mixtral-8x22b', () => {
    expect(parseParamCount('mixtral-8x22b')).toBe(176)
  })

  it('is case-insensitive (7B uppercase)', () => {
    expect(parseParamCount('some-model-7B')).toBe(7)
  })

  it('returns Infinity for unrecognised model id — unknown-model', () => {
    expect(parseParamCount('unknown-model')).toBe(Infinity)
  })

  it('returns Infinity for an empty string', () => {
    expect(parseParamCount('')).toBe(Infinity)
  })
})
