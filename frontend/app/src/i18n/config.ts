import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonRu from '../locales/ru/common.json'
import navRu from '../locales/ru/nav.json'
import authRu from '../locales/ru/auth.json'
import dashboardRu from '../locales/ru/dashboard.json'
import transactionsRu from '../locales/ru/transactions.json'
import accountsRu from '../locales/ru/accounts.json'
import budgetsRu from '../locales/ru/budgets.json'
import categoriesRu from '../locales/ru/categories.json'
import debtsRu from '../locales/ru/debts.json'
import goalsRu from '../locales/ru/goals.json'
import recurringRu from '../locales/ru/recurring.json'
import reportsRu from '../locales/ru/reports.json'
import documentsRu from '../locales/ru/documents.json'
import investmentsRu from '../locales/ru/investments.json'
import importRu from '../locales/ru/import.json'
import notificationsRu from '../locales/ru/notifications.json'
import advisorRu from '../locales/ru/advisor.json'
import adminRu from '../locales/ru/admin.json'
import bankSyncRu from '../locales/ru/bankSync.json'
import rulesRu from '../locales/ru/rules.json'
import trackersRu from '../locales/ru/trackers.json'
import validationRu from '../locales/ru/validation.json'

import commonFr from '../locales/fr/common.json'
import navFr from '../locales/fr/nav.json'
import authFr from '../locales/fr/auth.json'
import dashboardFr from '../locales/fr/dashboard.json'
import transactionsFr from '../locales/fr/transactions.json'
import accountsFr from '../locales/fr/accounts.json'
import budgetsFr from '../locales/fr/budgets.json'
import categoriesFr from '../locales/fr/categories.json'
import debtsFr from '../locales/fr/debts.json'
import goalsFr from '../locales/fr/goals.json'
import recurringFr from '../locales/fr/recurring.json'
import reportsFr from '../locales/fr/reports.json'
import documentsFr from '../locales/fr/documents.json'
import investmentsFr from '../locales/fr/investments.json'
import importFr from '../locales/fr/import.json'
import notificationsFr from '../locales/fr/notifications.json'
import advisorFr from '../locales/fr/advisor.json'
import adminFr from '../locales/fr/admin.json'
import bankSyncFr from '../locales/fr/bankSync.json'
import rulesFr from '../locales/fr/rules.json'
import trackersFr from '../locales/fr/trackers.json'
import validationFr from '../locales/fr/validation.json'
import commonDe from '../locales/de/common.json'
import navDe from '../locales/de/nav.json'
import authDe from '../locales/de/auth.json'
import dashboardDe from '../locales/de/dashboard.json'
import transactionsDe from '../locales/de/transactions.json'
import accountsDe from '../locales/de/accounts.json'
import budgetsDe from '../locales/de/budgets.json'
import categoriesDe from '../locales/de/categories.json'
import debtsDe from '../locales/de/debts.json'
import goalsDe from '../locales/de/goals.json'
import recurringDe from '../locales/de/recurring.json'
import reportsDe from '../locales/de/reports.json'
import documentsDe from '../locales/de/documents.json'
import investmentsDe from '../locales/de/investments.json'
import importDe from '../locales/de/import.json'
import notificationsDe from '../locales/de/notifications.json'
import advisorDe from '../locales/de/advisor.json'
import adminDe from '../locales/de/admin.json'
import bankSyncDe from '../locales/de/bankSync.json'
import rulesDe from '../locales/de/rules.json'
import trackersDe from '../locales/de/trackers.json'
import validationDe from '../locales/de/validation.json'
import commonIt from '../locales/it/common.json'
import navIt from '../locales/it/nav.json'
import authIt from '../locales/it/auth.json'
import dashboardIt from '../locales/it/dashboard.json'
import transactionsIt from '../locales/it/transactions.json'
import accountsIt from '../locales/it/accounts.json'
import budgetsIt from '../locales/it/budgets.json'
import categoriesIt from '../locales/it/categories.json'
import debtsIt from '../locales/it/debts.json'
import goalsIt from '../locales/it/goals.json'
import recurringIt from '../locales/it/recurring.json'
import reportsIt from '../locales/it/reports.json'
import documentsIt from '../locales/it/documents.json'
import investmentsIt from '../locales/it/investments.json'
import importIt from '../locales/it/import.json'
import notificationsIt from '../locales/it/notifications.json'
import advisorIt from '../locales/it/advisor.json'
import adminIt from '../locales/it/admin.json'
import bankSyncIt from '../locales/it/bankSync.json'
import rulesIt from '../locales/it/rules.json'
import trackersIt from '../locales/it/trackers.json'
import validationIt from '../locales/it/validation.json'
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
  fr: {
    common: commonFr,
    nav: navFr,
    auth: authFr,
    dashboard: dashboardFr,
    transactions: transactionsFr,
    accounts: accountsFr,
    budgets: budgetsFr,
    categories: categoriesFr,
    debts: debtsFr,
    goals: goalsFr,
    recurring: recurringFr,
    reports: reportsFr,
    documents: documentsFr,
    investments: investmentsFr,
    import: importFr,
    notifications: notificationsFr,
    advisor: advisorFr,
    admin: adminFr,
    bankSync: bankSyncFr,
    rules: rulesFr,
    trackers: trackersFr,
    validation: validationFr,
  },
  de: {
    common: commonDe,
    nav: navDe,
    auth: authDe,
    dashboard: dashboardDe,
    transactions: transactionsDe,
    accounts: accountsDe,
    budgets: budgetsDe,
    categories: categoriesDe,
    debts: debtsDe,
    goals: goalsDe,
    recurring: recurringDe,
    reports: reportsDe,
    documents: documentsDe,
    investments: investmentsDe,
    import: importDe,
    notifications: notificationsDe,
    advisor: advisorDe,
    admin: adminDe,
    bankSync: bankSyncDe,
    rules: rulesDe,
    trackers: trackersDe,
    validation: validationDe,
  },
  it: {
    common: commonIt,
    nav: navIt,
    auth: authIt,
    dashboard: dashboardIt,
    transactions: transactionsIt,
    accounts: accountsIt,
    budgets: budgetsIt,
    categories: categoriesIt,
    debts: debtsIt,
    goals: goalsIt,
    recurring: recurringIt,
    reports: reportsIt,
    documents: documentsIt,
    investments: investmentsIt,
    import: importIt,
    notifications: notificationsIt,
    advisor: advisorIt,
    admin: adminIt,
    bankSync: bankSyncIt,
    rules: rulesIt,
    trackers: trackersIt,
    validation: validationIt,
  },
  ru: {
    common: commonRu,
    nav: navRu,
    auth: authRu,
    dashboard: dashboardRu,
    transactions: transactionsRu,
    accounts: accountsRu,
    budgets: budgetsRu,
    categories: categoriesRu,
    debts: debtsRu,
    goals: goalsRu,
    recurring: recurringRu,
    reports: reportsRu,
    documents: documentsRu,
    investments: investmentsRu,
    import: importRu,
    notifications: notificationsRu,
    advisor: advisorRu,
    admin: adminRu,
    bankSync: bankSyncRu,
    rules: rulesRu,
    trackers: trackersRu,
    validation: validationRu,
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
    supportedLngs: ['en', 'el', 'ru', 'fr', 'de', 'it'],
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
