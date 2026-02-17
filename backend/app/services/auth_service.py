from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime

from app.models import User
from app.schemas import UserCreate, UserUpdate
from app.utils.security import get_password_hash, verify_password


class AuthService:
    """Service for authentication-related operations."""
    
    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """Get user by email address."""
        return db.query(User).filter(User.email == email).first()
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return db.query(User).filter(User.id == user_id).first()
    
    @staticmethod
    def create_user(db: Session, user_data: UserCreate) -> User:
        """Create a new user."""
        db_user = User(
            email=user_data.email,
            hashed_password=get_password_hash(user_data.password),
            full_name=user_data.full_name
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    @staticmethod
    def update_user(db: Session, user: User, user_data: UserUpdate) -> User:
        """Update user information."""
        if user_data.full_name is not None:
            user.full_name = user_data.full_name
        if user_data.email is not None:
            user.email = user_data.email
        
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def change_password(db: Session, user: User, current_password: str, new_password: str) -> bool:
        """Change user password."""
        if not verify_password(current_password, user.hashed_password):
            return False
        
        user.hashed_password = get_password_hash(new_password)
        db.commit()
        return True
    
    @staticmethod
    def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password."""
        user = AuthService.get_user_by_email(db, email)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user