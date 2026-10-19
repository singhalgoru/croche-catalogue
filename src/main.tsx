import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics, initializePageTracking } from './services/analytics'
import { initializeMetaPixel } from './services/meta'
import { captureCampaign } from './utils/campaign'
import { captureInternalTrafficPreference } from './utils/internalTraffic'
import { installChunkLoadRecovery } from './utils/chunkLoadRecovery'

installChunkLoadRecovery()
captureCampaign()
captureInternalTrafficPreference()
initializeAnalytics()
initializeMetaPixel()
initializePageTracking()

document.getElementById('product-fallback-style')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
