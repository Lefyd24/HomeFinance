import pandas as pd
import io
import csv
from typing import List, Dict, Any
from datetime import datetime
import re

# TODO: Add parsing per specific bank formats (e.g. ING, ABN AMRO) for better accuracy and handling of specific quirks.
def parse_bank_file(content: bytes, file_type: str) -> List[Dict[str, Any]]:
    """Parse bank statement file (CSV or Excel)."""
    transactions = []
    
    try:
        if file_type == "csv":
            # Robust CSV parsing: decode bytes, detect delimiter, use python engine
            try:
                text = content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    text = content.decode('latin-1')
                except UnicodeDecodeError:
                    text = content.decode('cp1252', errors='replace')

            # Try to detect delimiter from a sample
            sample = text[:4096]
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=[',', ';', '\t', '|'])
                delimiter = dialect.delimiter
            except Exception:
                # Default to comma
                delimiter = ','

            df = pd.read_csv(io.StringIO(text), sep=delimiter, engine='python', on_bad_lines='skip')
        elif file_type in ["xlsx", "xls"]:
            # Parse Excel
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl' if file_type == 'xlsx' else None)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        # Skip completely empty rows
        df = df.dropna(how='all')
        
        # If dataframe is empty, raise error
        if df.empty:
            raise ValueError("The file appears to be empty or has no valid data")
        
        # Standardize column names (common variations)
        column_mapping = {
            'date': ['date', 'Date', 'DATE', 'transaction_date', 'Transaction Date', 'datum', 'Datum', 'ΗΜ/ΝΙΑ ΚΙΝΗΣΗΣ', 'ημ/νια', 'Transaction_Date'],
            'description': ['description', 'Description', 'DESCRIPTION', 'desc', 'Desc', 'DESC', 'narrative', 'Narrative', 'transactie', 'Transactie', 'ΠΕΡΙΓΡΑΦΗ', 'περιγραφη', 'Details', 'details', 'DETAILS'],
            'amount': ['amount', 'Amount', 'AMOUNT', 'bedrag', 'Bedrag', 'value', 'Value', 'ΠΟΣΟ', 'ποσο', 'Value_Date'],
            'debit': ['debit', 'Debit', 'DEBIT', 'af', 'Af', 'AF', 'withdrawal', 'Withdrawal'],
            'credit': ['credit', 'Credit', 'CREDIT', 'bij', 'Bij', 'BIJ', 'deposit', 'Deposit']
        }
        
        # Find actual column names in the file
        actual_columns = {}
        for standard, variations in column_mapping.items():
            for col in df.columns:
                col_stripped = str(col).strip()
                if col_stripped in variations:
                    actual_columns[standard] = col
                    break
        
        # Validate we have minimum required columns
        if 'description' not in actual_columns:
            raise ValueError("Could not find a 'description' column in the file. Please ensure your file has proper headers.")
        
        if 'date' not in actual_columns:
            raise ValueError("Could not find a 'date' column in the file. Please ensure your file has proper headers.")
        
        if 'amount' not in actual_columns and ('debit' not in actual_columns or 'credit' not in actual_columns):
            raise ValueError("Could not find 'amount' or 'debit/credit' columns in the file. Please ensure your file has proper headers.")
        
        # Parse each row
        for idx, row in df.iterrows():
            # Skip rows where all important fields are empty
            if all(pd.isna(row.get(actual_columns.get(key))) for key in ['date', 'description', 'amount'] if key in actual_columns):
                continue
                
            transaction = {}
            
            # Parse date
            if 'date' in actual_columns:
                date_val = row[actual_columns['date']]
                if pd.notna(date_val):
                    transaction['date'] = parse_date(date_val)
                else:
                    # Skip rows without dates
                    continue
            else:
                # Skip rows without dates
                continue
            
            # Parse description
            if 'description' in actual_columns:
                desc = row[actual_columns['description']]
                transaction['description'] = str(desc).strip() if pd.notna(desc) else 'Unknown'
            else:
                transaction['description'] = 'Unknown'
            
            # Parse amount
            if 'amount' in actual_columns:
                amount_val = row[actual_columns['amount']]
                transaction['amount'] = parse_amount(amount_val)
            elif 'debit' in actual_columns and 'credit' in actual_columns:
                # Handle separate debit/credit columns
                debit_val = row[actual_columns['debit']]
                credit_val = row[actual_columns['credit']]
                debit = parse_amount(debit_val) if pd.notna(debit_val) else 0
                credit = parse_amount(credit_val) if pd.notna(credit_val) else 0
                transaction['amount'] = credit - debit
            else:
                transaction['amount'] = 0.0
            
            # Skip transactions with zero amount
            if transaction['amount'] == 0:
                continue
            
            transactions.append(transaction)
        
        if len(transactions) == 0:
            raise ValueError("No valid transactions found in the file. Please check the file format and data.")
        
        return transactions
        
    except ValueError as e:
        # Re-raise ValueError as-is
        raise
    except Exception as e:
        raise ValueError(f"Error parsing file: {str(e)}")


def parse_date(date_val) -> datetime:
    """Parse various date formats into datetime object."""
    if isinstance(date_val, datetime):
        return date_val
    
    if isinstance(date_val, pd.Timestamp):
        return date_val.to_pydatetime()
    
    if pd.isna(date_val):
        return datetime.now()
    
    date_str = str(date_val).strip()
    
    # Try different date formats
    date_formats = [
        '%Y-%m-%d',
        '%d/%m/%Y',
        '%m/%d/%Y',
        '%d-%m-%Y',
        '%Y/%m/%d',
        '%d.%m.%Y',
        '%Y.%m.%d',
        '%d-%b-%Y',
        '%d %b %Y',
        '%d-%B-%Y',
        '%d %B %Y',
        '%Y%m%d'
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    
    # Try pandas to_datetime as last resort
    try:
        return pd.to_datetime(date_str).to_pydatetime()
    except:
        # If all else fails, return current date
        return datetime.now()


def parse_amount(amount_val) -> float:
    """Parse various amount formats into float."""
    if pd.isna(amount_val):
        return 0.0
    
    if isinstance(amount_val, (int, float)):
        return float(amount_val)
    
    # Convert to string and clean
    amount_str = str(amount_val).strip()
    
    # Remove currency symbols and whitespace
    amount_str = re.sub(r'[€$£¥₹\s]', '', amount_str)
    
    # Handle European format (comma as decimal separator)
    # Check if there's both comma and dot
    if ',' in amount_str and '.' in amount_str:
        # Determine which is the decimal separator
        # Usually the last one is decimal, the others are thousands separators
        last_comma_pos = amount_str.rfind(',')
        last_dot_pos = amount_str.rfind('.')
        
        if last_comma_pos > last_dot_pos:
            # Comma is decimal separator (European format)
            amount_str = amount_str.replace('.', '').replace(',', '.')
        else:
            # Dot is decimal separator (US format)
            amount_str = amount_str.replace(',', '')
    elif ',' in amount_str:
        # Only comma - could be decimal or thousands separator
        # If there are digits after comma, it's likely decimal
        parts = amount_str.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            # Likely decimal separator
            amount_str = amount_str.replace(',', '.')
        else:
            # Likely thousands separator
            amount_str = amount_str.replace(',', '')
    
    # Remove any remaining non-numeric characters except minus and dot
    amount_str = re.sub(r'[^0-9.\-]', '', amount_str)
    
    try:
        return float(amount_str)
    except ValueError:
        return 0.0


def detect_duplicates(transactions: List[Dict], existing_transactions: List[Any], threshold: float = 0.9) -> List[int]:
    """Detect potential duplicate transactions."""
    duplicates = []
    
    for i, new_tx in enumerate(transactions):
        for existing in existing_transactions:
            # Check date match (within 1 day)
            if 'date' in new_tx and hasattr(existing, 'date'):
                date_diff = abs((new_tx['date'] - existing.date).days)
                if date_diff > 1:
                    continue
            else:
                continue
            
            # Check amount match (within 1 cent)
            if abs(new_tx.get('amount', 0) - float(existing.amount)) > 0.01:
                continue
            
            # Check description similarity
            new_desc = new_tx.get('description', '').lower().strip()
            existing_desc = (existing.description.lower().strip() 
                           if hasattr(existing, 'description') else '')
            
            # Simple similarity check - exact match or substring match
            if new_desc == existing_desc or (len(new_desc) > 5 and new_desc in existing_desc):
                duplicates.append(i)
                break
    
    return duplicates