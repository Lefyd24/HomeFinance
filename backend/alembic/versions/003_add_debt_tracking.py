"""add debt tracking tables

Revision ID: 003
Create Date: 2026-02-19

"""

from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'debts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('creditor', sa.String(200), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('original_balance', sa.Float(), nullable=False),
        sa.Column('current_balance', sa.Float(), nullable=False),
        sa.Column('interest_rate', sa.Float(), nullable=True),
        sa.Column('minimum_payment', sa.Float(), nullable=True),
        sa.Column('opened_date', sa.Date(), nullable=True),
        sa.Column('maturity_date', sa.Date(), nullable=True),
        sa.Column('priority', sa.Integer(), server_default='0'),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('is_paid_off', sa.Boolean(), server_default='0'),
        sa.Column('paid_off_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table(
        'debt_payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('debt_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('principal_amount', sa.Float(), nullable=True),
        sa.Column('interest_amount', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['debt_id'], ['debts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('ix_debts_user_id', 'debts', ['user_id'])
    op.create_index('ix_debts_is_active', 'debts', ['is_active'])
    op.create_index('ix_debts_is_paid_off', 'debts', ['is_paid_off'])
    op.create_index('ix_debt_payments_debt_id', 'debt_payments', ['debt_id'])
    op.create_index('ix_debt_payments_payment_date', 'debt_payments', ['payment_date'])


def downgrade():
    op.drop_index('ix_debt_payments_payment_date', table_name='debt_payments')
    op.drop_index('ix_debt_payments_debt_id', table_name='debt_payments')
    op.drop_index('ix_debts_is_paid_off', table_name='debts')
    op.drop_index('ix_debts_is_active', table_name='debts')
    op.drop_index('ix_debts_user_id', table_name='debts')
    
    op.drop_table('debt_payments')
    op.drop_table('debts')
