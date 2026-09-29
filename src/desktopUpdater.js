import { check } from '@tauri-apps/plugin-updater'

// Uses only the native endpoint configured by Tauri. No vault data is sent.
export async function checkDesktopUpdate() {
  return check()
}

export async function closeDesktopUpdate(update) {
  if (update) await update.close()
}

export async function installDesktopUpdate(update, onProgress) {
  let downloaded = 0
  let total = null
  await update.downloadAndInstall(event => {
    if (event.event === 'Started') {
      downloaded = 0
      total = event.data.contentLength || null
    } else if (event.event === 'Progress') downloaded += event.data.chunkLength
    onProgress({ phase: event.event === 'Finished' ? 'installing' : 'downloading', downloaded, total })
  })
}
