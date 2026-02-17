# Personal Finance Management System - Project Plan

## Overview
A comprehensive personal finance application built with FastAPI backend and vanilla JS frontend using Tailwind CSS + DaisyUI.

---

## Technology Stack

### Backend
- **Framework**: FastAPI
- **Database**: SQLite (via SQLAlchemy ORM)
- **Authentication**: JWT tokens with OAuth2
- **Migrations**: Alembic
- **Testing**: pytest

### Frontend
- **HTML5**: Semantic markup
- **CSS**: Tailwind CSS
- **UI Components**: DaisyUI
- **JavaScript**: Vanilla ES6+
- **Build Tool**: Vite (optional, for Tailwind compilation)

---

## Project Structure

```
personal-finance/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Configuration settings
│   │   ├── database.py          # Database connection & session
│   │   ├── models/              # SQLAlchemy models
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── account.py
│   │   │   ├── category.py
│   │   │   ├── transaction.py
│   │   │   ├── budget.py
│   │   │   └── report.py
│   │   ├── schemas/             # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── account.py
│   │   │   ├── category.py
│   │   │   ├── transaction.py
│   │   │   ├── budget.py
│   │   │   └── report.py
│   │   ├── routers/             # API endpoints
│   │   │   ├── __init__.py
│   │   │   ├── auth.py          # Authentication endpoints
│   │   │   ├── accounts.py      # Account management
│   │   │   ├── categories.py    # Category management
│   │   │   ├── transactions.py  # Transactions CRUD
│   │   │   ├── budgets.py       # Budget module
│   │   │   ├── import_wizard.py # Bank import wizard
│   │   │   └── reports.py       # Reporting module
│   │   ├── services/            # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── transaction_service.py
│   │   │   ├── budget_service.py
│   │   │   ├── import_service.py
│   │   │   └── report_service.py
│   │   ├── utils/               # Utilities
│   │   │   ├── __init__.py
│   │   │   ├── security.py      # JWT, password hashing
│   │   │   ├── file_parsers.py  # CSV, Excel, PDF parsers
│   │   │   └── validators.py
│   │   └── dependencies.py      # FastAPI dependencies
│   ├── alembic/                 # Database migrations
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable components
│   │   │   ├── layout/          # Layout components
│   │   │   ├── forms/           # Form components
│   │   │   ├── charts/          # Chart components
│   │   │   └── modals/          # Modal dialogs
│   │   ├── pages/               # Page views
│   │   │   ├── dashboard.html
│   │   │   ├── transactions.html
│   │   │   ├── budgets.html
│   │   │   ├── import.html
│   │   │   ├── reports.html
│   │   │   ├── accounts.html
│   │   │   ├── categories.html
│   │   │   ├── login.html
│   │   │   └── register.html
│   │   ├── js/
│   │   │   ├── api.js           # API client
│   │   │   ├── auth.js          # Authentication logic
│   │   │   ├── dashboard.js
│   │   │   ├── transactions.js
│   │   │   ├── budgets.js
│   │   │   ├── import.js
│   │   │   ├── reports.js
│   │   │   ├── utils.js
│   │   │   └── main.js
│   │   ├── styles/
│   │   │   └── main.css
│   │   └── assets/
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
└── PLAN.md
```

---

## Database Schema

### Users Table
```sql
users
- id: INTEGER PRIMARY KEY
- email: VARCHAR(255) UNIQUE NOT NULL
- hashed_password: VARCHAR(255) NOT NULL
- full_name: VARCHAR(255)
- is_active: BOOLEAN DEFAULT TRUE
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Accounts Table
```sql
accounts
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY
- name: VARCHAR(100) NOT NULL (e.g., "Eurobank", "Wallet", "TBG Bank")
- type: VARCHAR(50) (checking, savings, credit, cash, investment)
- currency: VARCHAR(3) DEFAULT 'EUR'
- balance: DECIMAL(15,2) DEFAULT 0
- description: TEXT
- is_active: BOOLEAN DEFAULT TRUE
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Categories Table
```sql
categories
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY (NULL for system defaults)
- name: VARCHAR(100) NOT NULL
- type: VARCHAR(20) (income, expense, transfer)
- color: VARCHAR(7) (hex color for UI)
- icon: VARCHAR(50) (icon name)
- parent_id: INTEGER FOREIGN KEY (for subcategories)
- is_system: BOOLEAN DEFAULT FALSE
- created_at: TIMESTAMP
```

### Transactions Table
```sql
transactions
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY
- account_id: INTEGER FOREIGN KEY
- category_id: INTEGER FOREIGN KEY
- amount: DECIMAL(15,2) NOT NULL
- type: VARCHAR(20) (income, expense, transfer)
- description: TEXT
- date: DATE NOT NULL
- notes: TEXT
- is_imported: BOOLEAN DEFAULT FALSE
- import_batch_id: VARCHAR(100)
- source_file: VARCHAR(255)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### Budgets Table
```sql
budgets
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY
- name: VARCHAR(100) NOT NULL
- amount: DECIMAL(15,2) NOT NULL
- period: VARCHAR(20) (monthly, yearly, custom)
- start_date: DATE
- end_date: DATE
- is_active: BOOLEAN DEFAULT TRUE
- created_at: TIMESTAMP
```

### BudgetCategories Table
```sql
budget_categories
- id: INTEGER PRIMARY KEY
- budget_id: INTEGER FOREIGN KEY
- category_id: INTEGER FOREIGN KEY
- allocated_amount: DECIMAL(15,2)
```

### ImportBatches Table
```sql
import_batches
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY
- filename: VARCHAR(255)
- file_type: VARCHAR(50) (csv, xlsx, pdf)
- status: VARCHAR(20) (pending, processing, completed, error)
- total_rows: INTEGER
- processed_rows: INTEGER
- created_at: TIMESTAMP
- completed_at: TIMESTAMP
```

### SavedReports Table
```sql
saved_reports
- id: INTEGER PRIMARY KEY
- user_id: INTEGER FOREIGN KEY
- name: VARCHAR(255)
- report_type: VARCHAR(50)
- configuration: JSON (filter params, grouping, etc.)
- created_at: TIMESTAMP
```

---

## API Endpoints

### Authentication (`/api/auth`)
```
POST   /register          # User registration
POST   /login             # User login (returns JWT)
POST   /refresh           # Refresh JWT token
POST   /logout            # Logout (invalidate token)
GET    /me                # Get current user info
PUT    /me                # Update user profile
POST   /change-password   # Change password
```

### Accounts (`/api/accounts`)
```
GET    /                  # List all accounts
POST   /                  # Create new account
GET    /{id}              # Get account details
PUT    /{id}              # Update account
DELETE /{id}              # Delete account
GET    /{id}/transactions # Get account transactions
GET    /{id}/balance      # Get account balance history
```

### Categories (`/api/categories`)
```
GET    /                  # List all categories (system + user)
POST   /                  # Create custom category
GET    /{id}              # Get category details
PUT    /{id}              # Update category
DELETE /{id}              # Delete custom category
GET    /suggestions       # Get category suggestions for text
```

### Transactions (`/api/transactions`)
```
GET    /                  # List transactions (with filters)
POST   /                  # Create manual transaction
GET    /{id}              # Get transaction details
PUT    /{id}              # Update transaction
DELETE /{id}              # Delete transaction
POST   /bulk-update       # Bulk update transactions
POST   /bulk-delete       # Bulk delete transactions
```

### Import Wizard (`/api/import`)
```
POST   /upload            # Upload bank file
GET    /formats           # Get supported formats
POST   /preview           # Preview parsed transactions
POST   /preview/{id}/update  # Update preview row
POST   /preview/{id}/categorize  # Auto-categorize preview
POST   /confirm           # Confirm and import transactions
GET    /batches           # Get import history
GET    /batches/{id}      # Get batch details
```

### Budgets (`/api/budgets`)
```
GET    /                  # List budgets
POST   /                  # Create budget
GET    /{id}              # Get budget details
PUT    /{id}              # Update budget
DELETE /{id}              # Delete budget
GET    /{id}/progress      # Get budget progress/spending
GET    /{id}/report        # Get budget vs actual report
POST   /{id}/categories    # Add category to budget
DELETE /{id}/categories/{cat_id}  # Remove category from budget
```

### Reports (`/api/reports`)
```
GET    /types             # Get available report types
POST   /custom            # Generate custom report
GET    /spending          # Spending report
GET    /income            # Income report
GET    /cashflow          # Cash flow analysis
GET    /category-breakdown # Category breakdown
GET    /trend             # Trend analysis
GET    /balance-history   # Account balance over time
POST   /save              # Save report configuration
GET    /saved             # List saved reports
GET    /saved/{id}        # Get saved report
DELETE /saved/{id}        # Delete saved report
```

---

## Frontend Architecture

### Pages & Components

#### Layout Components
- **Navbar**: Navigation with logo, menu, user profile dropdown
- **Sidebar**: Navigation menu for different modules
- **Footer**: App footer with links
- **Layout**: Main layout wrapper with sidebar + content area

#### Common Components
- **Modal**: Reusable modal dialog
- **Toast**: Notification system
- **LoadingSpinner**: Loading indicator
- **ConfirmDialog**: Confirmation dialog
- **DataTable**: Sortable, filterable table
- **DateRangePicker**: Date range selection
- **CurrencyInput**: Currency formatted input
- **CategorySelect**: Category dropdown with icons/colors
- **AccountSelect**: Account dropdown

#### Feature-Specific Components

##### Dashboard
- **SummaryCards**: Total balance, income, expenses, net
- **RecentTransactions**: Latest transactions list
- **BudgetOverview**: Budget progress bars
- **SpendingChart**: Monthly spending chart
- **QuickActions**: Quick add transaction buttons

##### Transactions
- **TransactionForm**: Add/edit transaction form
- **TransactionList**: Transaction list with filters
- **TransactionFilters**: Advanced filtering options
- **BulkActionsToolbar**: Bulk operations toolbar

##### Import Wizard
- **FileUploader**: Drag & drop file upload
- **FormatSelector**: Bank format selection
- **PreviewTable**: Editable preview of transactions
- **CategoryMatcher**: Categorization interface
- **AccountAssigner**: Account assignment
- **DuplicateDetector**: Show potential duplicates
- **ProgressBar**: Import progress indicator

##### Budgets
- **BudgetCard**: Individual budget display
- **BudgetForm**: Create/edit budget form
- **BudgetProgress**: Visual progress bar with stats
- **CategoryAllocator**: Allocate amounts to categories

##### Reports
- **ReportBuilder**: Custom report configuration
- **ChartContainer**: Chart wrapper with options
- **ReportFilters**: Filter controls for reports
- **ExportOptions**: Export to PDF/CSV/Excel
- **SavedReportsList**: List of saved reports

##### Accounts & Categories
- **AccountCard**: Account display card
- **AccountForm**: Create/edit account form
- **CategoryTree**: Hierarchical category display
- **CategoryForm**: Create/edit category form

---

## Feature Implementation Details

### 1. Authentication System
- JWT-based authentication with access and refresh tokens
- Password hashing with bcrypt
- Protected routes with HTTP-only cookies
- Login page with form validation
- Registration page with email validation
- Password reset functionality
- Session management

### 2. Bank Import Wizard

#### Supported Formats
- **CSV**: Comma-separated values
- **Excel**: .xlsx files
- **PDF**: Bank statement PDFs (text extraction)

#### Wizard Steps
1. **Upload**: Drag & drop or file select
2. **Format Selection**: Choose bank format or auto-detect
3. **Column Mapping**: Map file columns to transaction fields
4. **Preview & Edit**: Review parsed transactions
   - Edit description, amount, date
   - Assign/correct categories
   - Assign account
   - Mark duplicates
5. **Categorization**: 
   - Auto-categorize based on rules/ML
   - Manual categorization with search
   - Create new categories on the fly
6. **Validation**: Check for errors/warnings
7. **Confirm**: Import to database

#### Duplicate Detection
- Match by date, amount, and description similarity
- Show confidence score
- Allow user to review and decide

### 3. Budget Module

#### Budget Types
- **Monthly Budget**: Recurring monthly budget
- **Yearly Budget**: Annual budget
- **Custom Period**: Specific date range

#### Features
- Set overall budget amount
- Allocate by categories
- Track spending vs budget
- Visual progress indicators
- Alerts for overspending (75%, 90%, 100%)
- Rollover unused budget option

### 4. Reporting Module

#### Report Types
1. **Spending by Category**: Pie/donut chart
2. **Income vs Expenses**: Bar chart over time
3. **Cash Flow**: Line chart with running balance
4. **Category Trend**: Line chart showing category over time
5. **Account Balance History**: Multi-line chart
6. **Transaction List**: Filterable table report
7. **Budget vs Actual**: Comparison chart

#### Customization Options
- Date range selection
- Account filter (multi-select)
- Category filter (multi-select)
- Transaction type filter
- Group by (day, week, month, year, category)
- Chart type (bar, line, pie, table)
- Export format (PDF, CSV, Excel)

#### Saved Reports
- Save report configurations
- Quick re-run saved reports
- Share reports (optional)

### 5. Manual Transaction Entry

#### Features
- Quick add modal
- Full form with all fields
- Recurring transaction option (optional)
- Split transactions (optional)
- Receipt attachment (optional)
- Transaction templates (optional)

### 6. Account Management

#### Features
- Create multiple accounts
- Account types (checking, savings, credit, cash, etc.)
- Starting balance setup
- Archive old accounts
- Account-specific transaction filtering

---

## Development Phases

### Phase 1: Foundation (Week 1)
- [ ] Project setup and structure
- [ ] Database models and migrations
- [ ] Basic FastAPI app setup
- [ ] Tailwind + DaisyUI configuration
- [ ] Basic HTML structure

### Phase 2: Authentication (Week 1-2)
- [ ] User model and registration
- [ ] JWT authentication
- [ ] Login/Register pages
- [ ] Protected routes middleware
- [ ] User profile management

### Phase 3: Core Data (Week 2)
- [ ] Account CRUD
- [ ] Category CRUD (with defaults)
- [ ] Account management UI
- [ ] Category management UI

### Phase 4: Transactions (Week 3)
- [ ] Transaction model and API
- [ ] Manual transaction entry
- [ ] Transaction list with filters
- [ ] Transaction editing/deletion
- [ ] Dashboard with summary

### Phase 5: Import Wizard (Week 4)
- [ ] File upload endpoint
- [ ] CSV/Excel parsers
- [ ] Preview and mapping UI
- [ ] Categorization interface
- [ ] Duplicate detection
- [ ] Import confirmation

### Phase 6: Budget Module (Week 5)
- [ ] Budget model and API
- [ ] Budget creation UI
- [ ] Budget tracking and progress
- [ ] Alerts and notifications

### Phase 7: Reporting (Week 6)
- [ ] Report service
- [ ] Chart.js integration
- [ ] Custom report builder
- [ ] Saved reports
- [ ] Export functionality

### Phase 8: Polish & Testing (Week 7)
- [ ] UI/UX improvements
- [ ] Responsive design
- [ ] Error handling
- [ ] Input validation
- [ ] Testing (backend + frontend)
- [ ] Documentation

---

## Default Categories (System)

### Income
- Salary
- Freelance
- Investments
- Gifts
- Refunds
- Other Income

### Expense
- Housing
  - Rent/Mortgage
  - Utilities
  - Maintenance
- Food
  - Groceries
  - Restaurants
  - Takeout
- Transportation
  - Fuel
  - Public Transport
  - Car Maintenance
- Healthcare
  - Medical
  - Pharmacy
  - Insurance
- Shopping
  - Clothing
  - Electronics
  - Home Goods
- Entertainment
  - Movies/Shows
  - Games
  - Hobbies
- Financial
  - Banking Fees
  - Taxes
  - Interest
- Other Expense

---

## Security Considerations

1. **Authentication**: JWT with secure cookie settings
2. **Authorization**: User can only access own data
3. **Input Validation**: Pydantic schemas + SQL injection prevention
4. **File Uploads**: File type validation, size limits, virus scanning (optional)
5. **Passwords**: Bcrypt hashing, minimum complexity requirements
6. **CORS**: Proper CORS configuration
7. **Rate Limiting**: API rate limiting
8. **HTTPS**: Enforce HTTPS in production

---

## Future Enhancements (Optional)

1. Multi-currency support with exchange rates
2. Recurring transactions
3. Bill reminders
4. Receipt scanning/OCR
5. Bank API integration (Plaid, Open Banking)
6. Mobile app (PWA or React Native)
7. Data backup/restore
8. Shared accounts/family mode
9. Investment tracking
10. Goal setting and tracking

---

## Getting Started Commands

```bash
# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install fastapi uvicorn sqlalchemy alembic python-jose[cryptography] passlib[bcrypt] python-multipart pandas openpyxl

# Frontend setup
cd frontend
npm install -D tailwindcss postcss autoprefixer
npm install -D daisyui@latest
npx tailwindcss init -p

# Database migrations
cd backend
alembic init alembic
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head

# Run development servers
# Backend
cd backend
uvicorn app.main:app --reload

# Frontend
cd frontend
npm run dev
```

---

## File Naming Conventions

- **Backend**: snake_case (e.g., `transaction_service.py`)
- **Frontend**: 
  - JavaScript: camelCase (e.g., `transactionService.js`)
  - Components: PascalCase (e.g., `TransactionList.js`)
  - Pages: lowercase with dashes (e.g., `transactions.html`)
  - CSS: lowercase (e.g., `main.css`)

---

## Success Criteria

- [ ] User can register, login, and manage profile
- [ ] User can create and manage multiple accounts
- [ ] User can manually add, edit, delete transactions
- [ ] User can import bank files via wizard with categorization
- [ ] User can create and track budgets
- [ ] User can generate customizable reports
- [ ] All data is properly secured and isolated per user
- [ ] UI is responsive and user-friendly
- [ ] Application handles errors gracefully
