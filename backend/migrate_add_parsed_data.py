"""
Migration script to add parsed_data column to import_batches table.
Run this once to update the database schema without losing data.
"""
import sqlite3
from pathlib import Path

# Database path
db_path = Path(__file__).parent / "finance.db"

def migrate():
    """Add parsed_data column to import_batches table."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(import_batches)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'parsed_data' not in columns:
            print("Adding parsed_data column to import_batches table...")
            cursor.execute(
                "ALTER TABLE import_batches ADD COLUMN parsed_data TEXT"
            )
            conn.commit()
            print("✓ Successfully added parsed_data column")
        else:
            print("✓ Column parsed_data already exists")
        
    except Exception as e:
        print(f"✗ Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
    print("\nMigration completed!")
