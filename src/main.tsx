import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeAnalytics, initializePageTracking } from './services/analytics'
import { initializeMetaPixel } from './services/meta'
import { captureCampaign } from './utils/campaign'
import { captureInternalTrafficPreference } from './utils/internalTraffic'
import { installChunkLoadRecovery } from './utils/chunkLoadRecovery'

if (import.meta.env.DEV && window.location.pathname === '/__preview/customer-love/') {
  void import('./dev/CustomerLovePreview').then(({ default: Preview }) => {
    createRoot(document.getElementById('root')!).render(<StrictMode><Preview /></StrictMode>)
  }).catch(error => {
    console.error('Unable to load local Customer Love preview:', error)
    document.getElementById('root')!.textContent = 'Unable to load the local preview. Check the browser console.'
  })
} else {
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
}
