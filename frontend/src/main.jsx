import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ReferenceProvider } from './context/Reference.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ReferenceProvider>
        <App />
      </ReferenceProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
