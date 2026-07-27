import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './shell/AppShell'
import { LoginPage } from './routes/LoginPage'
import { RegisterPage } from './routes/RegisterPage'
import { ForgotPasswordPage } from './routes/ForgotPasswordPage'
import { ResetPasswordPage } from './routes/ResetPasswordPage'
import { VerifyEmailPage } from './routes/VerifyEmailPage'

function DashboardPlaceholder() {
  return <p className="p-6">Dashboard content</p>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPlaceholder />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
