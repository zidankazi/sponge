import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionProvider } from './hooks/useSession'
import LandingScreen from './components/game/LandingScreen'
import DemoPage from './pages/DemoPage'
import ErrorBanner from './components/ErrorBanner'

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ErrorBanner />
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/demo" element={<DemoPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
