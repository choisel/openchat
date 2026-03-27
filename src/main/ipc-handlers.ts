import { ipcMain } from 'electron'

export function registerIpcHandlers({ backendPort }: { backendPort: number }) {
  ipcMain.handle('get-backend-port', () => backendPort)
}
