import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SessionProvider } from './hooks/useSession'
import LandingScreen from './components/game/LandingScreen'
import DemoPage from './pages/DemoPage'
import ErrorBanner from './components/ErrorBanner'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <SessionProvider>
          <ErrorBanner />
          <Routes>
            <Route path="/" element={<LandingScreen />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
