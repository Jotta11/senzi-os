import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from '@/app/router'
import { AuthProvider } from '@/auth/AuthProvider'
import { queryClient } from '@/lib/queryClient'
import { initPwa } from '@/pwa/pwa'
import { UpdateBanner } from '@/pwa/PwaPrompts'
import '@/styles/base.css'

initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <UpdateBanner />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
