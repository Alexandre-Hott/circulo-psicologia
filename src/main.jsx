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
          <aside className="browser-mode-note" aria-label="Demonstração no navegador">
            Demonstração no navegador · alterações somem ao recarregar · ditado offline no aplicativo Windows.
          </aside>
          <App />
        </>}
  </StrictMode>,
)
