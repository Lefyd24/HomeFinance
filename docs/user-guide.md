# User guide

A tour of every part of Home Finance. Everything here works out of the box unless a section says otherwise.

## Contents

[Accounts](#accounts) · [Transactions](#transactions) · [Categories](#categories) · [Categorization rules](#categorization-rules) · [Importing data](#importing-data) · [Budgets](#budgets) · [Recurring expenses](#recurring-expenses) · [Debts](#debts) · [Goals](#goals) · [Reports](#reports) · [Trackers](#trackers) · [Documents](#documents) · [Dashboard](#dashboard) · [Account settings](#account-settings-and-people) · [Language and appearance](#language-and-appearance)

## Accounts

Add checking, savings, credit, cash and investment accounts. Each has a currency (the form offers EUR, USD and GBP), a balance, a description and an icon picked from a bank logo set.

- **Bank-linked accounts** get their balance from the bank, and manual transactions and imports are blocked on them. See [Bank connection](bank-sync.md).
- **Brokerage accounts** come from [Investments](investments.md).
- Deactivate an account to hide it without losing its history.

## Transactions

Record **income**, **expenses** and **transfers** between accounts. The list supports search, period, account and category filters, sorting and column choice.

- **Split** one transaction across several categories.
- **Bulk edit or delete** selected rows.
- **Transfers** between accounts need a destination account. If your bank sync produces two separate rows for one move of money, **pair** them into a single transfer. A synced row can also be **re-tagged** as a transfer to an account that has no row of its own, and un-marked later, which restores the original type and balance.
- Attach a transaction to one or more [trackers](#trackers).

## Categories

Colour-coded, with icons, and fully yours to rename or extend. Suggestions are offered when you create one. Deleting a category guards against orphaning transactions.

## Categorization rules

Write "if this, then that category" once, and every future import or bank-synced transaction that matches is categorized automatically.

- **Conditions** on description, counterparty, amount, account or type. Text conditions support contains, not contains, equals, starts with, ends with and regular expressions. Amounts support equals, less, greater and between.
- **Match all** conditions, or **match any**.
- **Priority**: lower runs first, and "stop on match" (on by default) ends the chain.
- **Preview** shows how many existing transactions a rule would match before you save it.
- **Apply** a single rule or **Apply all now** to categorize existing transactions. By default it skips already-categorized ones.
- Each rule shows how many times it has fired, so you can see which ones do real work.

## Importing data

The **Import** page accepts `.csv`, `.xlsx` and `.xls` exports with date, description and amount columns. The server parses the file and shows a preview of the rows it found.

> **Status:** the backend supports the full flow (preview, edit, categorize with rules, confirm into an account, batch history), but the web page currently stops at the preview step, and duplicate detection isn't part of the preview. For bulk history today, [bank sync](bank-sync.md) is the more complete route. Imports are rejected for bank-linked accounts.

## Budgets

Set a limit per period (monthly, yearly or custom dates) and allocate it across categories. Progress bars fill as you spend, with per-budget detail, a period report and summary. Budget thresholds can trigger [notifications](notifications.md).

## Recurring expenses

Track subscriptions and regular bills with an interval (days, weeks or months), a start date, the account and category, and optional reminders N days before due.

- The **upcoming list** shows what's due next.
- You **mark an expense as paid**, optionally linking it to a transaction. Payments can be edited or deleted later.
- Recurring expenses are **not** auto-posted. This keeps the ledger honest.
- Disable one instead of deleting it to keep its payment history.

## Debts

Track credit cards, mortgages, car and student loans, personal loans, bills and informal debts (or define a custom type) with balance, interest rate, minimum payment and a recurrence.

- **Record payments** against a debt, which adjusts the balance, and optionally create the linked transaction.
- **Payoff strategies** compares **snowball** (smallest balance first) with **avalanche** (highest interest first), with an optional extra monthly payment.
- Upcoming payments feed the dashboard and notifications.

## Goals

Set a savings target with an amount and optional date: an emergency fund, a holiday, a big purchase.

- Contribute or withdraw, with a full history.
- See the **monthly amount needed** to hit your date, and whether you're **on track** against your recent average.
- Link a goal to an account to track it automatically, and mark one as primary.

## Reports

Tabs: **Overview**, **Cash flow**, **Spending**, **Budgets**, **Debt**.

- A shared filter bar (date range preset or custom, accounts, categories) applies to every tab and is kept in the URL, so you can bookmark or share a view.
- **Saved reports** keep your favourite filters.
- **CSV export** for spending, income, cash flow, net worth, savings rate and top merchants.
- **Scheduled report emails** via [notification rules](notifications.md).

## Trackers

Free-form buckets for spending you want to follow, such as "Home renovation" or "Trip to Italy". Set an optional target, link existing transactions or create new ones, and a transaction can sit in several trackers.

## Documents

Keep receipts, statements and any file, organized into folders, with in-app preview, download and rename. Allowed types: PDF, images (jpg, png, gif, webp, svg), Word, Excel, text, CSV and zip, up to `DOCUMENTS_MAX_FILE_SIZE` (50 MB). Files are stored under `data/documents/<user>/` on your server.

## Dashboard

Your first screen: total balance, this month's income, spending and net saved, account balances, bills due in the next 30 days, budgets, goals, spending by category and recent activity. If a bank connection needs attention, it says so here.

## Account settings and people

- **Investor profile** and **API keys** are under the user menu.
- **Multiple people, one server**: each person has their own login and data. Registration is invite-only, and admins create and revoke invite codes and activate or deactivate users from the **Admin** page. See [Getting started](getting-started.md#5-promote-the-admin-and-invite-your-household).
- Email verification and a self-service forgot-password flow are built in. Login, registration and reset attempts are rate-limited per IP and per email.

## Language and appearance

The interface is available in **English** and **Greek** and follows your browser's language. It has a light and dark theme, installs as a PWA on phone and desktop (online only, with push support), and uses a bottom navigation bar on mobile. A floating quick-action button adds a transaction or opens the AI advisor from anywhere.

## Beyond the basics

- [Bank connection](bank-sync.md): automatic transaction sync
- [AI advisor](ai-advisor.md): ask questions about your own money
- [Investments](investments.md): brokerage sync and research
- [Notifications](notifications.md): alerts by email and push
