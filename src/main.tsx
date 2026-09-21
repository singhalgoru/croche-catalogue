import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics } from './services/analytics'
import { initializeMetaPixel } from './services/meta'
import { captureCampaign } from './utils/campaign'

captureCampaign()
initializeAnalytics()
initializeMetaPixel()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
