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

export default i18next
