import pandas as pd
import io
from typing import List, Dict, Any
from datetime import datetime


class ImportService:
    """Service for importing bank statements."""
    
    @staticmethod
    def parse_file(content: bytes, file_type: str) -> List[Dict[str, Any]]:
        """Parse bank statement file (CSV or Excel)."""
        transactions = []
        
        try:
            if file_type == "csv":
                df = pd.read_csv(io.BytesIO(content))
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(io.BytesIO(content))
            else:
                raise ValueError(f"Unsupported file type: {file_type}")
            
            # Standardize column names
            column_mapping = {
                'date': ['date', 'Date', 'transaction_date', 'Transaction Date', 'datum', 'Datum'],
                'description': ['description', 'Description', 'desc', 'Desc', 'narrative', 'Narrative'],
                'amount': ['amount', 'Amount', 'bedrag', 'Bedrag', 'value', 'Value'],
                'debit': ['debit', 'Debit', 'af', 'Af'],
                'credit': ['credit', 'Credit', 'bij', 'Bij']
            }
            
            actual_columns = {}
            for standard, variations in column_mapping.items():
                for col in df.columns:
                    if col in variations:
                        actual_columns[standard] = col
                        break
            
            # Parse each row
            for _, row in df.iterrows():
                transaction = {}
                
                # Parse date
                if 'date' in actual_columns:
                    date_val = row[actual_columns['date']]
                    if pd.notna(date_val):
                        try:
                            if isinstance(date_val, str):
                                for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y']:
                                    try:
                                        transaction['date'] = datetime.strptime(date_val, fmt)
                                        break
                                    except ValueError:
                                        continue
                            else:
                                transaction['date'] = pd.to_datetime(date_val)
                        except:
                            transaction['date'] = datetime.now()
                
                # Parse description
                if 'description' in actual_columns:
                    transaction['description'] = str(row[actual_columns['description']]) if pd.notna(row[actual_columns['description']]) else ''
                else:
                    transaction['description'] = 'Unknown'
                
                # Parse amount
                if 'amount' in actual_columns:
                    try:
                        transaction['amount'] = float(row[actual_columns['amount']])
                    except:
                        transaction['amount'] = 0.0
                elif 'debit' in actual_columns and 'credit' in actual_columns:
                    debit = float(row[actual_columns['debit']]) if pd.notna(row[actual_columns['debit']]) else 0
                    credit = float(row[actual_columns['credit']]) if pd.notna(row[actual_columns['credit']]) else 0
                    transaction['amount'] = credit - debit
                else:
                    transaction['amount'] = 0.0
                
                transactions.append(transaction)
            
            return transactions
            
        except Exception as e:
            raise ValueError(f"Error parsing file: {str(e)}")
    
    @staticmethod
    def detect_duplicates(
        new_transactions: List[Dict],
        existing_transactions: List[Any]
    ) -> List[int]:
        """Detect potential duplicate transactions."""
        duplicates = []
        
        for i, new_tx in enumerate(new_transactions):
            for existing in existing_transactions:
                # Check date match (within 1 day)
                if 'date' in new_tx and hasattr(existing, 'date'):
                    if abs((new_tx['date'] - existing.date).days) > 1:
                        continue
                
                # Check amount match
                if abs(new_tx.get('amount', 0) - float(existing.amount)) > 0.01:
                    continue
                
                # Check description similarity
                new_desc = new_tx.get('description', '').lower()
                existing_desc = existing.description.lower() if hasattr(existing, 'description') else ''
                
                if new_desc == existing_desc or (len(new_desc) > 5 and new_desc in existing_desc):
                    duplicates.append(i)
                    break
        
        return duplicates
    
    @staticmethod
    def suggest_categories(
        transactions: List[Dict],
        categories: List[Any]
    ) -> List[Dict]:
        """Suggest categories for transactions based on keywords."""
        # Simple keyword matching
        keyword_map = {
            "grocery": ["Groceries", "Food"],
            "supermarket": ["Groceries", "Food"],
            "restaurant": ["Food"],
            "fuel": ["Transportation"],
            "gas": ["Transportation"],
            "uber": ["Transportation"],
            "taxi": ["Transportation"],
            "amazon": ["Shopping"],
            "netflix": ["Entertainment"],
            "spotify": ["Entertainment"],
            "salary": ["Salary"],
            "rent": ["Housing"],
            "electric": ["Utilities"],
            "water": ["Utilities"],
            "phone": ["Utilities"],
            "internet": ["Utilities"],
            "doctor": ["Healthcare"],
            "pharmacy": ["Healthcare"],
        }
        
        results = []
        for tx in transactions:
            description = tx.get('description', '').lower()
            suggestion = None
            confidence = 0.0
            
            for keyword, cat_names in keyword_map.items():
                if keyword in description:
                    # Find matching category
                    for cat in categories:
                        if cat.name in cat_names:
                            suggestion = cat
                            confidence = 0.85
                            break
                    if suggestion:
                        break
            
            results.append({
                "transaction": tx,
                "suggested_category": suggestion,
                "confidence": confidence
            })
        
        return results