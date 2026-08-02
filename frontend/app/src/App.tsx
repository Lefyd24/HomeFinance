import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './shell/AppShell'
import { LoginPage } from './routes/LoginPage'
import { RegisterPage } from './routes/RegisterPage'
import { ForgotPasswordPage } from './routes/ForgotPasswordPage'
import { ResetPasswordPage } from './routes/ResetPasswordPage'
import { VerifyEmailPage } from './routes/VerifyEmailPage'
import { DashboardPage } from './dashboard/DashboardPage'
import { AccountsPage } from './accounts/AccountsPage'
import { CategoriesPage } from './categories/CategoriesPage'
import { TransactionsPage } from './transactions/TransactionsPage'
import { BudgetsPage } from './budgets/BudgetsPage'
import { DebtsPage } from './debts/DebtsPage'
import { GoalsPage } from './goals/GoalsPage'
import { RecurringPage } from './recurring/RecurringPage'
import { ReportsPage } from './reports/ReportsPage'
import { ImportWizardPage } from './import/ImportWizardPage'
import { DocumentsPage } from './documents/DocumentsPage'
import { AdvisorPage } from './advisor/AdvisorPage'
import { AiAdvisorPage } from './ai-advisor/AiAdvisorPage'
import { NotificationsPage } from './notifications/NotificationsPage'
import { ApiKeysPage } from './account-settings/ApiKeysPage'
import { BankSyncPage } from './bank-sync/BankSyncPage'
import { PrivacyPage } from './legal/PrivacyPage'
import { TermsPage } from './legal/TermsPage'
import { AdminPage } from './admin/AdminPage'

function App() {
  return (
    <Routes>
      {/* The PWA manifest's start_url and the deployed root are both "/".
          RequireAuth on /dashboard sends unauthenticated visitors to /login,
          so this lands both cases correctly. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Public by necessity: Enable Banking, the banks' consent screens and the
          data-sharing-consents portal link here for people with no account on
          this instance. Behind RequireAuth these would be dead links. */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/debts" element={<DebtsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/import" element={<ImportWizardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="/ai-advisor" element={<AiAdvisorPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/connections" element={<BankSyncPage />} />
          <Route path="/api-keys" element={<ApiKeysPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
