import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import Splash from './components/Splash.tsx'
import UpdateBanner from './components/UpdateBanner.tsx'
import { startUpdateChecks } from './lib/appUpdate.ts'

startUpdateChecks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
    <UpdateBanner />
    <Splash />
  </StrictMode>,
)
