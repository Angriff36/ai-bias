import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { needsPrivateWorkspace } from './App'
import './styles.css'

// Private sections need the browser database (SQL engine + IndexedDB). Start
// opening it now, in parallel with React, instead of after the section's code
// has loaded. The section reuses this same open when it mounts.
if (needsPrivateWorkspace() && !new URL(window.location.href).searchParams.has('code')) {
  void import('./api').then(({ api }) => api.health()).catch(() => undefined)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
