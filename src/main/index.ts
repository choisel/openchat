import { app, BrowserWindow, dialog } from 'electron'
import path from 'path'
import { BackendSpawner } from './backend-spawner'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null
let spawner: BackendSpawner | null = null

async function waitForVite(url: string, retries = 20, delayMs = 500): Promise<void> {
  const { net } = await import('electron')
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = net.request(url)
        req.on('response', () => resolve())
        req.on('error', reject)
        req.end()
      })
      return
    } catch {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

async function createWindow(backendPort: number) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    await waitForVite('http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'openchat.db')
  const scriptPath = path.join(__dirname, '../backend/index.js')

  spawner = new BackendSpawner({ scriptPath, dbPath })

  let backendPort: number
  try {
    backendPort = await spawner.waitForReady()
  } catch (err) {
    dialog.showErrorBox(
      'OpenChat — Fatal Error',
      'The backend server failed to start. Please restart the application.'
    )
    app.quit()
    return
  }

  registerIpcHandlers({ backendPort })
  await createWindow(backendPort)
})

app.on('window-all-closed', () => {
  spawner?.kill()
  app.quit()
})
