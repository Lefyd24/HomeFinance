import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonEn from '../locales/en/common.json'
import navEn from '../locales/en/nav.json'
import authEn from '../locales/en/auth.json'
import dashboardEn from '../locales/en/dashboard.json'
import transactionsEn from '../locales/en/transactions.json'
import accountsEn from '../locales/en/accounts.json'
import budgetsEn from '../locales/en/budgets.json'
import categoriesEn from '../locales/en/categories.json'
import debtsEn from '../locales/en/debts.json'
import goalsEn from '../locales/en/goals.json'
import recurringEn from '../locales/en/recurring.json'
import reportsEn from '../locales/en/reports.json'
import documentsEn from '../locales/en/documents.json'
import investmentsEn from '../locales/en/investments.json'
import importEn from '../locales/en/import.json'
import notificationsEn from '../locales/en/notifications.json'
import advisorEn from '../locales/en/advisor.json'
import adminEn from '../locales/en/admin.json'
import bankSyncEn from '../locales/en/bankSync.json'
import rulesEn from '../locales/en/rules.json'
import trackersEn from '../locales/en/trackers.json'
import validationEn from '../locales/en/validation.json'

import commonEl from '../locales/el/common.json'
import navEl from '../locales/el/nav.json'
import authEl from '../locales/el/auth.json'
import dashboardEl from '../locales/el/dashboard.json'
import transactionsEl from '../locales/el/transactions.json'
import accountsEl from '../locales/el/accounts.json'
import budgetsEl from '../locales/el/budgets.json'
import categoriesEl from '../locales/el/categories.json'
import debtsEl from '../locales/el/debts.json'
import goalsEl from '../locales/el/goals.json'
import recurringEl from '../locales/el/recurring.json'
import reportsEl from '../locales/el/reports.json'
import documentsEl from '../locales/el/documents.json'
import investmentsEl from '../locales/el/investments.json'
import importEl from '../locales/el/import.json'
import notificationsEl from '../locales/el/notifications.json'
import advisorEl from '../locales/el/advisor.json'
import adminEl from '../locales/el/admin.json'
import bankSyncEl from '../locales/el/bankSync.json'
import rulesEl from '../locales/el/rules.json'
import trackersEl from '../locales/el/trackers.json'
import validationEl from '../locales/el/validation.json'

export const defaultNS = 'common'

export const resources = {
  en: {
    common: commonEn,
    nav: navEn,
    auth: authEn,
    dashboard: dashboardEn,
    transactions: transactionsEn,
    accounts: accountsEn,
    budgets: budgetsEn,
    categories: categoriesEn,
    debts: debtsEn,
    goals: goalsEn,
    recurring: recurringEn,
    reports: reportsEn,
    documents: documentsEn,
    investments: investmentsEn,
    import: importEn,
    notifications: notificationsEn,
    advisor: advisorEn,
    admin: adminEn,
    bankSync: bankSyncEn,
    rules: rulesEn,
    trackers: trackersEn,
    validation: validationEn,
  },
  el: {
    common: commonEl,
    nav: navEl,
    auth: authEl,
    dashboard: dashboardEl,
    transactions: transactionsEl,
    accounts: accountsEl,
    budgets: budgetsEl,
    categories: categoriesEl,
    debts: debtsEl,
    goals: goalsEl,
    recurring: recurringEl,
    reports: reportsEl,
    documents: documentsEl,
    investments: investmentsEl,
    import: importEl,
    notifications: notificationsEl,
    advisor: advisorEl,
    admin: adminEl,
    bankSync: bankSyncEl,
    rules: rulesEl,
    trackers: trackersEl,
    validation: validationEl,
  },
} as const

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'el'],
    defaultNS,
    ns: Object.keys(resources.en),
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'pf-language',
    },
    interpolation: {
      escapeValue: false,
    },
  })

/**
 * Keep `<html lang>` in step with the active language.
 *
 * `index.html` hardcodes `lang="en"`, which is wrong the moment someone
 * switches to Greek — and not only for screen readers. Case mapping in CSS is
 * language-sensitive: uppercasing Greek is supposed to drop the tonos
 * (Ημέρας → ΗΜΕΡΑΣ), and browsers only apply that rule when the content
 * language says Greek. With `lang="en"` every `text-transform: uppercase`
 * label — which is most of the app's micro-labels — kept its accents.
 *
 * Hyphenation, quote marks and font fallback all key off this too, so it is
 * worth setting once here rather than patching the strings that show it.
 */
function syncDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language.split('-')[0]
}

syncDocumentLanguage(i18next.resolvedLanguage ?? i18next.language ?? 'en')
i18next.on('languageChanged', syncDocumentLanguage)

export default i18next
