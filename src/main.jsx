import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import DesktopVault from './DesktopVault.jsx'

const isDesktop = Boolean(window.__TAURI_INTERNALS__)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isDesktop
      ? <DesktopVault />
      : <>
          <aside className="browser-mode-note" aria-label="Limite da demonstração web">
            Demonstração no navegador. O ditado offline está disponível no aplicativo Windows; esta página não envia áudio para reconhecimento pela internet.
          </aside>
          <App />
        </>}
  </StrictMode>,
)
