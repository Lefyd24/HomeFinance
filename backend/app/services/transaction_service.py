from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.models import Transaction, Account, Category, Debt, DebtPayment
from app.schemas import TransactionCreate, TransactionUpdate


class TransactionService:
    """Service for transaction-related operations."""
    
    @staticmethod
    def get_transactions(
        db: Session,
        user_id: int,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        account_id: Optional[int] = None,
        category_id: Optional[int] = None,
        type: Optional[str] = None,
        search: Optional[str] = None
    ) -> tuple[List[Transaction], int]:
        """Get transactions with filters and total count."""
        query = db.query(Transaction).filter(Transaction.user_id == user_id)
        
        # Apply filters
        if start_date:
            query = query.filter(Transaction.date >= start_date)
        if end_date:
            query = query.filter(Transaction.date <= end_date)
        if account_id:
            query = query.filter(Transaction.account_id == account_id)
        if category_id:
            query = query.filter(Transaction.category_id == category_id)
        if type:
            query = query.filter(Transaction.type == type)
        if search:
            query = query.filter(Transaction.description.ilike(f"%{search}%"))
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        transactions = query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()
        
        return transactions, total
    
    @staticmethod
    def get_transaction(db: Session, transaction_id: int, user_id: int) -> Optional[Transaction]:
        """Get a single transaction by ID."""
        return db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id
        ).first()
    
    @staticmethod
    def create_transaction(
        db: Session,
        transaction_data: TransactionCreate,
        user_id: int
    ) -> Transaction:
        """Create a new transaction and update account balance(s)."""
        # Validate transfer
        if transaction_data.type == "transfer":
            if not transaction_data.destination_account_id:
                raise ValueError("Transfer transactions require a destination account")
            if transaction_data.account_id == transaction_data.destination_account_id:
                raise ValueError("Source and destination accounts cannot be the same")
        
        # Create transaction
        db_transaction = Transaction(
            user_id=user_id,
            **transaction_data.model_dump()
        )
        db.add(db_transaction)
        
        # Update account balance(s) with proper rounding
        account = db.query(Account).filter(Account.id == transaction_data.account_id).first()
        if account:
            if transaction_data.type == "income":
                account.balance = round(account.balance + transaction_data.amount, 2)
            elif transaction_data.type == "expense":
                account.balance = round(account.balance - transaction_data.amount, 2)
            elif transaction_data.type == "transfer":
                # Deduct from source account
                account.balance = round(account.balance - transaction_data.amount, 2)
                # Add to destination account
                destination_account = db.query(Account).filter(
                    Account.id == transaction_data.destination_account_id
                ).first()
                if destination_account:
                    destination_account.balance = round(destination_account.balance + transaction_data.amount, 2)
        
        db.commit()
        db.refresh(db_transaction)
        return db_transaction
    
    @staticmethod
    def update_transaction(
        db: Session,
        transaction: Transaction,
        transaction_data: TransactionUpdate
    ) -> Transaction:
        """Update a transaction and adjust account balance(s)."""
        # Store old values
        old_amount = transaction.amount
        old_type = transaction.type
        old_account_id = transaction.account_id
        old_destination_id = transaction.destination_account_id
        
        # Revert old balance with proper rounding
        old_account = db.query(Account).filter(Account.id == old_account_id).first()
        if old_account:
            if old_type == "income":
                old_account.balance = round(old_account.balance - old_amount, 2)
            elif old_type == "expense":
                old_account.balance = round(old_account.balance + old_amount, 2)
            elif old_type == "transfer":
                # Revert transfer: add back to source, deduct from destination
                old_account.balance = round(old_account.balance + old_amount, 2)
                if old_destination_id:
                    old_destination = db.query(Account).filter(Account.id == old_destination_id).first()
                    if old_destination:
                        old_destination.balance = round(old_destination.balance - old_amount, 2)
        
        # Validate new transfer
        new_type = transaction_data.type or old_type
        new_account_id = transaction_data.account_id or old_account_id
        new_destination_id = transaction_data.destination_account_id or old_destination_id
        
        if new_type == "transfer":
            if not new_destination_id:
                raise ValueError("Transfer transactions require a destination account")
            if new_account_id == new_destination_id:
                raise ValueError("Source and destination accounts cannot be the same")
        
        # Update transaction fields
        update_data = transaction_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(transaction, field, value)
        
        # Apply new balance
        new_account = db.query(Account).filter(Account.id == new_account_id).first()
        new_amount = transaction_data.amount or old_amount
        
        if new_account:
            if new_type == "income":
                new_account.balance = round(new_account.balance + new_amount, 2)
            elif new_type == "expense":
                new_account.balance = round(new_account.balance - new_amount, 2)
            elif new_type == "transfer":
                # Deduct from source
                new_account.balance = round(new_account.balance - new_amount, 2)
                # Add to destination
                new_destination = db.query(Account).filter(Account.id == new_destination_id).first()
                if new_destination:
                    new_destination.balance = round(new_destination.balance + new_amount, 2)
        
        db.commit()
        db.refresh(transaction)
        return transaction
    
    @staticmethod
    def delete_transaction(db: Session, transaction: Transaction) -> None:
        """Delete a transaction and adjust account balance(s)."""
        # Adjust account balance with proper rounding
        account = db.query(Account).filter(Account.id == transaction.account_id).first()
        if account:
            if transaction.type == "income":
                account.balance = round(account.balance - transaction.amount, 2)
            elif transaction.type == "expense":
                account.balance = round(account.balance + transaction.amount, 2)
            elif transaction.type == "transfer":
                # Revert transfer: add back to source, deduct from destination
                account.balance = round(account.balance + transaction.amount, 2)
                if transaction.destination_account_id:
                    destination_account = db.query(Account).filter(
                        Account.id == transaction.destination_account_id
                    ).first()
                    if destination_account:
                        destination_account.balance = round(destination_account.balance - transaction.amount, 2)
        
        # Check if transaction is linked to a debt payment and reverse it
        debt_payment = db.query(DebtPayment).filter(
            DebtPayment.transaction_id == transaction.id
        ).first()
        
        if debt_payment:
            # Get the associated debt
            debt = db.query(Debt).filter(Debt.id == debt_payment.debt_id).first()
            if debt:
                # Increase the debt balance by the payment amount (reverse the payment)
                debt.current_balance = round(debt.current_balance + debt_payment.amount, 2)
                # If debt was marked as paid off, unmark it
                if debt.is_paid_off and debt.current_balance > 0:
                    debt.is_paid_off = False
                    debt.paid_off_date = None
            
            # Delete the debt payment record
            db.delete(debt_payment)
        
        db.delete(transaction)
        db.commit()
    
    @staticmethod
    def get_transaction_summary(
        db: Session,
        user_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> dict:
        """Get transaction summary (income/expenses) for a period."""
        query = db.query(Transaction).filter(Transaction.user_id == user_id)
        
        if start_date:
            query = query.filter(Transaction.date >= start_date)
        if end_date:
            query = query.filter(Transaction.date <= end_date)
        
        income = query.filter(Transaction.type == "income").with_entities(
            func.sum(Transaction.amount)
        ).scalar() or 0
        
        expenses = query.filter(Transaction.type == "expense").with_entities(
            func.sum(Transaction.amount)
        ).scalar() or 0
        
        return {
            "income": float(income),
            "expenses": float(expenses),
            "net": float(income) - float(expenses)
        }