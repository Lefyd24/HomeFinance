"""add debt recurrence fields

Revision ID: 004
Revises: 003
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # Add columns to debts table using batch mode for SQLite compatibility
    with op.batch_alter_table('debts') as batch_op:
        batch_op.add_column(sa.Column('recurrence_interval', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('recurrence_unit', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('recurrence_day_of_month', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('linked_account_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('next_payment_date', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('linked_category_id', sa.Integer(), nullable=True))
    
    # Add columns to debt_payments table
    with op.batch_alter_table('debt_payments') as batch_op:
        batch_op.add_column(sa.Column('account_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('transaction_id', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('debt_payments') as batch_op:
        batch_op.drop_column('transaction_id')
        batch_op.drop_column('account_id')
    
    with op.batch_alter_table('debts') as batch_op:
        batch_op.drop_column('linked_category_id')
        batch_op.drop_column('next_payment_date')
        batch_op.drop_column('linked_account_id')
        batch_op.drop_column('recurrence_day_of_month')
        batch_op.drop_column('recurrence_unit')
        batch_op.drop_column('recurrence_interval')
