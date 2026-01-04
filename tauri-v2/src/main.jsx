import React from 'react'
import ReactDOM from 'react-dom/client'
import './tauriApi.js' // Initialize Tauri API bridge (provides window.electron compatibility)
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
