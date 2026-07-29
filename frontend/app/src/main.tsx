import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { ensureServiceWorker } from './notifications/pushNotifications'
import './i18n/config'
import './index.css'

const queryClient = new QueryClient()

// Register the service worker on boot rather than waiting for someone to enable
// push notifications — installability (add to home screen) needs an active
// registration, and existing users' installed PWAs expect one to stay live.
// Production only: the worker bypasses the HTTP cache, which fights with Vite's
// dev server. Failure is non-fatal, the app works fine without it.
if (import.meta.env.PROD) {
  void ensureServiceWorker().catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DirectionProvider dir="ltr" direction="ltr">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <BrowserRouter>
              <AuthProvider>
                <App />
                <Toaster richColors closeButton position="top-center" />
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </DirectionProvider>
    </ThemeProvider>
  </StrictMode>,
)
