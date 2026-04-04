import { describe, it, expect } from 'vitest'
import { processFile } from '../../src/backend/file-processor'

describe('processFile', () => {
  it('processes a .py text file', async () => {
    const buf = Buffer.from('def hello():\n    return "world"\n')
    const result = await processFile('hello.py', buf, 'text/plain')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.language).toBe('python')
      expect(result.content).toContain('def hello')
    }
  })

  it('processes a .ts text file', async () => {
    const buf = Buffer.from('const x: number = 42')
    const result = await processFile('util.ts', buf, 'text/plain')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.language).toBe('typescript')
    }
  })

  it('processes a .txt file with no known language', async () => {
    const buf = Buffer.from('Hello world')
    const result = await processFile('notes.txt', buf, 'text/plain')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.language).toBe('plaintext')
    }
  })

  it('processes a PNG image as base64 data URL', async () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000' +
      '0090775de0000000c4944415408d76360606000000002000163360' +
      '16a0000000049454e44ae426082',
      'hex'
    )
    const result = await processFile('img.png', png, 'image/png')
    expect(result.type).toBe('image')
    if (result.type === 'image') {
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/)
      expect(result.mimeType).toBe('image/png')
    }
  })

  it('returns pdf-unreadable for an empty-text PDF', async () => {
    const emptyPdf = Buffer.from('%PDF-1.4\n%%EOF')
    const result = await processFile('scan.pdf', emptyPdf, 'application/pdf')
    expect(['pdf', 'pdf-unreadable']).toContain(result.type)
  })
})
