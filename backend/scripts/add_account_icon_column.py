"""
Database migration script to add icon column to accounts table.

This script adds the 'icon' column to the accounts table for existing databases.
Run this script after updating the Account model to include the icon field.

Usage:
    cd backend
    python scripts/add_account_icon_column.py
"""

import sqlite3
import os
import sys

# Add parent directory to path to import config
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.config import settings


def migrate_add_icon_column(db_path=None):
    """Add icon column to accounts table."""
    if not db_path:
        # Extract database path from DATABASE_URL
        db_url = settings.DATABASE_URL
        if db_url.startswith('sqlite:///./'):
            db_path = db_url.replace('sqlite:///./', '')
        elif db_url.startswith('sqlite:///'):
            db_path = db_url.replace('sqlite:///', '')
        else:
            print(f"Unsupported database type: {db_url}")
            return False
    
    if not os.path.exists(db_path):
        print(f"Database not found at: {db_path}")
        return False
    
    print(f"Connecting to database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(accounts)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if 'icon' in column_names:
            print("Column 'icon' already exists in accounts table.")
            conn.close()
            return True
        
        # Add the icon column
        print("Adding 'icon' column to accounts table...")
        cursor.execute("ALTER TABLE accounts ADD COLUMN icon VARCHAR(100)")
        conn.commit()
        
        print("✓ Migration completed successfully!")
        conn.close()
        return True
        
    except sqlite3.Error as e:
        print(f"✗ Error during migration: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("Database Migration: Add icon column to accounts")
    print("=" * 50)
    print()

    success = migrate_add_icon_column()

    if not success:
        sys.exit(1)

    print()
    print("Migration completed. You can now use custom account icons!")
