"""
One-time script fix existing floating-point precision errors in account balances.
Run this once to clean up the database.
"""
import sqlite3
from pathlib import Path

# Database path
db_path = Path(__file__).parent / "finance.db"

def fix_balances():
    """Round all account balances to 2 decimal places."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Get all accounts with their current balances
        cursor.execute("SELECT id, name, balance FROM accounts")
        accounts = cursor.fetchall()
        
        print(f"Found {len(accounts)} accounts to check")
        fixed_count = 0
        
        for account_id, name, balance in accounts:
            # Round to 2 decimal places
            rounded_balance = round(balance, 2)
            
            # Only update if different
            if balance != rounded_balance:
                print(f"Fixing account '{name}': {balance} → {rounded_balance}")
                cursor.execute(
                    "UPDATE accounts SET balance = ? WHERE id = ?",
                    (rounded_balance, account_id)
                )
                fixed_count += 1
        
        conn.commit()
        print(f"\n✓ Fixed {fixed_count} account balances")
        
        if fixed_count == 0:
            print("✓ All account balances are already properly rounded")
        
    except Exception as e:
        print(f"✗ Error fixing balances: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    print("Fixing account balance precision errors...\n")
    fix_balances()
    print("\nDone!")
