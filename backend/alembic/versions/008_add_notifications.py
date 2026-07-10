"""add notification tables and per-item notify columns

Revision ID: 008
Revises: 007
Create Date: 2026-07-09

"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), server_default="1"),
        sa.Column("push_enabled", sa.Boolean(), server_default="0"),
        sa.Column("default_days_before", sa.Integer(), server_default="3"),
        sa.Column("quiet_hours_start", sa.Integer(), nullable=True),
        sa.Column("quiet_hours_end", sa.Integer(), nullable=True),
        sa.Column("smtp_host", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer(), nullable=True),
        sa.Column("smtp_user", sa.String(255), nullable=True),
        sa.Column("smtp_password_encrypted", sa.Text(), nullable=True),
        sa.Column("smtp_from", sa.String(255), nullable=True),
        sa.Column("smtp_use_tls", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_notification_settings_id", "notification_settings", ["id"]
    )

    op.create_table(
        "notification_rules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("threshold", sa.Float(), nullable=True),
        sa.Column("report_type", sa.String(40), nullable=True),
        sa.Column("schedule_kind", sa.String(20), nullable=True),
        sa.Column("schedule_value", sa.Integer(), nullable=True),
        sa.Column("channels", sa.String(40), server_default="email"),
        sa.Column("is_active", sa.Boolean(), server_default="1"),
        sa.Column("last_fired_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_rules_id", "notification_rules", ["id"])

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint"),
    )
    op.create_index("ix_push_subscriptions_id", "push_subscriptions", ["id"])

    op.create_table(
        "notification_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("dedupe_key", sa.String(255), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("channels_sent", sa.String(40), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "dedupe_key", name="uq_notif_dedupe"),
    )
    op.create_index("ix_notification_log_id", "notification_log", ["id"])

    op.add_column(
        "recurring_expenses",
        sa.Column("notify_enabled", sa.Boolean(), server_default="0"),
    )
    op.add_column(
        "recurring_expenses",
        sa.Column("notify_days_before", sa.Integer(), nullable=True),
    )

    op.add_column(
        "debts",
        sa.Column("notify_enabled", sa.Boolean(), server_default="0"),
    )
    op.add_column(
        "debts",
        sa.Column("notify_days_before", sa.Integer(), nullable=True),
    )


def downgrade():
    op.drop_column("debts", "notify_days_before")
    op.drop_column("debts", "notify_enabled")
    op.drop_column("recurring_expenses", "notify_days_before")
    op.drop_column("recurring_expenses", "notify_enabled")

    op.drop_index("ix_notification_log_id", table_name="notification_log")
    op.drop_table("notification_log")

    op.drop_index("ix_push_subscriptions_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")

    op.drop_index("ix_notification_rules_id", table_name="notification_rules")
    op.drop_table("notification_rules")

    op.drop_index("ix_notification_settings_id", table_name="notification_settings")
    op.drop_table("notification_settings")
