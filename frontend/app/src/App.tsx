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
import { TrackersPage } from './trackers/TrackersPage'
import { RecurringPage } from './recurring/RecurringPage'
import { ReportsPage } from './reports/ReportsPage'
import { ImportWizardPage } from './import/ImportWizardPage'
import { DocumentsPage } from './documents/DocumentsPage'
import { InvestmentsPage } from './investments/InvestmentsPage'
import { MarketNewsPage } from './investments/MarketNewsPage'
import { TickerSearchPage } from './investments/TickerSearchPage'
import { CompanyResearchPage } from './investments/CompanyResearchPage'
import { ComparisonPage } from './investments/ComparisonPage'
import { TechnicalPage } from './investments/TechnicalPage'
import { BacktestPage } from './investments/BacktestPage'
import { ScenarioLibraryPage } from './investments/ScenarioLibraryPage'
import { ScenarioDetailPage } from './investments/ScenarioDetailPage'
import { AdvisorPage } from './advisor/AdvisorPage'
import { AiAdvisorPage } from './ai-advisor/AiAdvisorPage'
import { NotificationsPage } from './notifications/NotificationsPage'
import { ApiKeysPage } from './account-settings/ApiKeysPage'
import { BankSyncPage } from './bank-sync/BankSyncPage'
import { RulesPage } from './rules/RulesPage'
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
          <Route path="/trackers" element={<TrackersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/import" element={<ImportWizardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/investments/news" element={<MarketNewsPage />} />
          <Route path="/investments/search" element={<TickerSearchPage />} />
          <Route path="/investments/research" element={<CompanyResearchPage />} />
          <Route path="/investments/compare" element={<ComparisonPage />} />
          <Route path="/investments/technical" element={<TechnicalPage />} />
          <Route path="/investments/backtest" element={<BacktestPage />} />
          <Route path="/investments/scenarios" element={<ScenarioLibraryPage />} />
          <Route path="/investments/scenarios/:id" element={<ScenarioDetailPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="/ai-advisor" element={<AiAdvisorPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/connections" element={<BankSyncPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/api-keys" element={<ApiKeysPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
