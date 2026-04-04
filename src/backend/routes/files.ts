import { Router } from 'express'
import multer from 'multer'
import { processFile } from '../file-processor'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
})

export function createFilesRouter(): Router {
  const router = Router()

  router.post('/process', (req, res, next) => {
    upload.array('files')(req, res, (err) => {
      if (err) {
        res.status(413).json({ error: err.message })
        return
      }
      next()
    })
  }, async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' })
      return
    }

    try {
      const results = await Promise.all(
        files.map(f => processFile(f.originalname, f.buffer, f.mimetype))
      )
      res.json(results)
    } catch (err: any) {
      console.error('[files] processing error:', err)
      res.status(500).json({ error: 'File processing failed', details: err.message })
    }
  })

  return router
}
