import path from 'path'

export type AttachmentData =
  | { type: 'text'; language: string; content: string; filename: string }
  | { type: 'pdf'; content: string; filename: string }
  | { type: 'pdf-unreadable'; filename: string }
  | { type: 'image'; dataUrl: string; mimeType: string; filename: string }

const EXT_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  sql: 'sql',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', sass: 'sass',
  xml: 'xml',
  dockerfile: 'dockerfile',
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])

export async function processFile(filename: string, buffer: Buffer, mimeType: string): Promise<AttachmentData> {
  const ext = path.extname(filename).replace('.', '').toLowerCase()

  if (IMAGE_MIMES.has(mimeType) || /^image\//.test(mimeType)) {
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
    return { type: 'image', dataUrl, mimeType, filename }
  }

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default
      const data = await pdfParse(buffer)
      const text = data.text?.trim() ?? ''
      if (!text) return { type: 'pdf-unreadable', filename }
      return { type: 'pdf', content: text, filename }
    } catch {
      return { type: 'pdf-unreadable', filename }
    }
  }

  // Default: treat as text/code
  const content = buffer.toString('utf-8')
  const language = EXT_TO_LANGUAGE[ext] ?? 'plaintext'
  return { type: 'text', language, content, filename }
}
