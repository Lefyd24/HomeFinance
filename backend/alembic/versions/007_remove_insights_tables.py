"""remove user_insights and spending_patterns tables

Revision ID: 007
Revises: e7a884b96b62
Create Date: 2026-05-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '007'
down_revision = 'e7a884b96b62'
branch_labels = None
depends_on = None


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    return inspect(bind).has_table(table_name)


def upgrade():
    if _table_exists('spending_patterns'):
        op.drop_index('ix_spending_patterns_pattern_type', table_name='spending_patterns', if_exists=True)
        op.drop_index('ix_spending_patterns_user_id', table_name='spending_patterns', if_exists=True)
        op.drop_table('spending_patterns')

    if _table_exists('user_insights'):
        op.drop_index('ix_user_insights_is_read', table_name='user_insights', if_exists=True)
        op.drop_index('ix_user_insights_type', table_name='user_insights', if_exists=True)
        op.drop_index('ix_user_insights_user_id', table_name='user_insights', if_exists=True)
        op.drop_table('user_insights')


def downgrade():
    op.create_table(
        'user_insights',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('metric_value', sa.Float(), nullable=True),
        sa.Column('comparison_value', sa.Float(), nullable=True),
        sa.Column('percentage_change', sa.Float(), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default='0'),
        sa.Column('is_dismissed', sa.Boolean(), server_default='0'),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_insights_user_id', 'user_insights', ['user_id'])
    op.create_index('ix_user_insights_type', 'user_insights', ['type'])
    op.create_index('ix_user_insights_is_read', 'user_insights', ['is_read'])

    op.create_table(
        'spending_patterns',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('pattern_type', sa.String(50), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.String(255), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('frequency', sa.String(20), nullable=True),
        sa.Column('average_amount', sa.Float(), nullable=True),
        sa.Column('first_detected', sa.Date(), nullable=False),
        sa.Column('last_occurrence', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_spending_patterns_user_id', 'spending_patterns', ['user_id'])
    op.create_index('ix_spending_patterns_pattern_type', 'spending_patterns', ['pattern_type'])
