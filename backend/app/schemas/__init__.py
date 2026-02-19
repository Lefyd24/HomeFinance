from app.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse, UserInDB
from app.schemas.account import (
    AccountBase,
    AccountCreate,
    AccountUpdate,
    AccountResponse,
)
from app.schemas.category import (
    CategoryBase,
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
    CategorySuggestion,
)
from app.schemas.transaction import (
    TransactionBase,
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    TransactionList,
    BulkTransactionUpdate,
    BulkTransactionDelete,
)
from app.schemas.budget import (
    BudgetBase,
    BudgetCreate,
    BudgetUpdate,
    BudgetResponse,
    BudgetProgress,
    BudgetCategoryAllocation,
)
from app.schemas.import_batch import (
    ImportTransactionPreview,
    ImportPreviewResponse,
    ImportBatchResponse,
    ImportConfirmRequest,
)
from app.schemas.report import (
    ReportFilter,
    SpendingReport,
    CashflowReport,
    TrendReport,
    SavedReportCreate,
    SavedReportResponse,
)
from app.schemas.auth import (
    Token,
    TokenPayload,
    LoginRequest,
    PasswordChange,
    APIKeyResponse,
    APIKeyStatus,
)
from app.schemas.dashboard import (
    DashboardSummary,
    DashboardRecentTransaction,
    DashboardBudgetProgress,
    DashboardData,
)
from app.schemas.goal import (
    GoalBase,
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalProgress,
    GoalTransactionBase,
    GoalTransactionCreate,
    GoalTransactionResponse,
    GoalSummary,
)
from app.schemas.debt import (
    DebtBase,
    DebtCreate,
    DebtUpdate,
    DebtResponse,
    DebtPaymentBase,
    DebtPaymentCreate,
    DebtPaymentResponse,
    DebtSummary,
    PayoffComparison,
    PayoffStrategy,
    PayoffScheduleItem,
    ExtraPaymentScenario,
    UpcomingPayment,
)

__all__ = [
    # User schemas
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserResponse",
    "UserInDB",
    # Account schemas
    "AccountBase",
    "AccountCreate",
    "AccountUpdate",
    "AccountResponse",
    # Category schemas
    "CategoryBase",
    "CategoryCreate",
    "CategoryUpdate",
    "CategoryResponse",
    "CategorySuggestion",
    # Transaction schemas
    "TransactionBase",
    "TransactionCreate",
    "TransactionUpdate",
    "TransactionResponse",
    "TransactionList",
    "BulkTransactionUpdate",
    "BulkTransactionDelete",
    # Budget schemas
    "BudgetBase",
    "BudgetCreate",
    "BudgetUpdate",
    "BudgetResponse",
    "BudgetProgress",
    "BudgetCategoryAllocation",
    # Import schemas
    "ImportTransactionPreview",
    "ImportPreviewResponse",
    "ImportBatchResponse",
    "ImportConfirmRequest",
    # Report schemas
    "ReportFilter",
    "SpendingReport",
    "CashflowReport",
    "TrendReport",
    "SavedReportCreate",
    "SavedReportResponse",
    # Auth schemas
    "Token",
    "TokenPayload",
    "LoginRequest",
    "PasswordChange",
    "APIKeyResponse",
    "APIKeyStatus",
    # Dashboard schemas
    "DashboardSummary",
    "DashboardRecentTransaction",
    "DashboardBudgetProgress",
    "DashboardData",
    # Goal schemas
    "GoalBase",
    "GoalCreate",
    "GoalUpdate",
    "GoalResponse",
    "GoalProgress",
    "GoalTransactionBase",
    "GoalTransactionCreate",
    "GoalTransactionResponse",
    "GoalSummary",
    # Debt schemas
    "DebtBase",
    "DebtCreate",
    "DebtUpdate",
    "DebtResponse",
    "DebtPaymentBase",
    "DebtPaymentCreate",
    "DebtPaymentResponse",
    "DebtSummary",
    "PayoffComparison",
    "PayoffStrategy",
    "PayoffScheduleItem",
    "ExtraPaymentScenario",
    "UpcomingPayment",
]
