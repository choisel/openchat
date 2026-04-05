import { ipcMain, shell } from 'electron'

export function registerIpcHandlers({ backendPort }: { backendPort: number }) {
  ipcMain.handle('get-backend-port', () => backendPort)
  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url)
  })
}
