from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.utils.security import get_current_user_authenticated as get_current_user
from app.schemas import CategoryCreate, CategoryUpdate, CategoryResponse, CategorySuggestion
from app.models import User, Category

router = APIRouter(prefix="/categories", tags=["Categories"])

# Default system categories
DEFAULT_CATEGORIES = [
    # Income categories
    {"name": "Salary", "type": "income", "color": "#10B981", "icon": "salary"},
    {"name": "Freelance", "type": "income", "color": "#3B82F6", "icon": "work"},
    {"name": "Investments", "type": "income", "color": "#8B5CF6", "icon": "trending_up"},
    {"name": "Gifts", "type": "income", "color": "#F59E0B", "icon": "gift"},
    {"name": "Refunds", "type": "income", "color": "#10B981", "icon": "replay"},
    {"name": "Other Income", "type": "income", "color": "#6B7280", "icon": "more"},
    
    # Expense categories
    {"name": "Housing", "type": "expense", "color": "#EF4444", "icon": "home"},
    {"name": "Food", "type": "expense", "color": "#F59E0B", "icon": "restaurant"},
    {"name": "Transportation", "type": "expense", "color": "#3B82F6", "icon": "directions_car"},
    {"name": "Healthcare", "type": "expense", "color": "#EF4444", "icon": "local_hospital"},
    {"name": "Shopping", "type": "expense", "color": "#8B5CF6", "icon": "shopping_cart"},
    {"name": "Entertainment", "type": "expense", "color": "#EC4899", "icon": "movie"},
    {"name": "Utilities", "type": "expense", "color": "#F59E0B", "icon": "bolt"},
    {"name": "Insurance", "type": "expense", "color": "#6B7280", "icon": "shield"},
    {"name": "Education", "type": "expense", "color": "#10B981", "icon": "school"},
    {"name": "Travel", "type": "expense", "color": "#3B82F6", "icon": "flight"},
    {"name": "Personal Care", "type": "expense", "color": "#8B5CF6", "icon": "spa"},
    {"name": "Other Expense", "type": "expense", "color": "#6B7280", "icon": "more"},
]


def get_or_create_default_categories(db: Session, user_id: int) -> None:
    """Create default categories for a new user if they don't exist."""
    existing_categories = db.query(Category).filter(
        Category.user_id == user_id
    ).count()
    
    if existing_categories == 0:
        # Create system categories for this user
        for cat_data in DEFAULT_CATEGORIES:
            category = Category(
                user_id=user_id,
                is_system=False,  # User's own copy
                **cat_data
            )
            db.add(category)
        db.commit()


@router.get("/", response_model=List[CategoryResponse])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    type: Optional[str] = Query(None, pattern="^(income|expense|transfer)$"),
    include_system: bool = True
):
    """Get all categories for current user."""
    # Ensure user has default categories
    get_or_create_default_categories(db, current_user.id)
    
    query = db.query(Category).filter(
        Category.user_id == current_user.id
    )
    
    if type:
        query = query.filter(Category.type == type)
    
    categories = query.all()
    return categories


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category_data: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new custom category."""
    db_category = Category(
        user_id=current_user.id,
        is_system=False,
        **category_data.model_dump()
    )
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    
    return db_category


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get category by ID."""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    return category


@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a category."""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    # Don't allow editing system categories
    if category.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify system categories"
        )
    
    # Update fields
    update_data = category_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
    
    db.commit()
    db.refresh(category)
    
    return category


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a category."""
    category = db.query(Category).filter(
        Category.id == category_id,
        Category.user_id == current_user.id
    ).first()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    # Don't allow deleting system categories
    if category.is_system:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete system categories"
        )

    from app.models.category_rule import CategoryRule

    referencing = (
        db.query(CategoryRule)
        .filter(
            CategoryRule.user_id == current_user.id,
            CategoryRule.category_id == category_id,
        )
        .all()
    )
    if referencing:
        names = ", ".join(r.name for r in referencing[:5])
        more = f" (+{len(referencing) - 5} more)" if len(referencing) > 5 else ""
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete category while categorisation rules reference it: "
                f"{names}{more}. Delete or reassign those rules first."
            ),
        )

    db.delete(category)
    db.commit()

    return {"message": "Category deleted successfully"}


@router.get("/suggestions")
def get_category_suggestions(
    text: str = Query(..., min_length=3),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get category suggestions based on transaction description."""
    # Simple keyword matching for suggestions
    keywords = {
        "grocery": ["Groceries", "Food"],
        "supermarket": ["Groceries", "Food"],
        "restaurant": ["Food", "Entertainment"],
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
    
    text_lower = text.lower()
    suggestions = []
    
    for keyword, category_names in keywords.items():
        if keyword in text_lower:
            for cat_name in category_names:
                category = db.query(Category).filter(
                    Category.user_id == current_user.id,
                    Category.name.ilike(f"%{cat_name}%")
                ).first()
                
                if category and category.id not in [s.category_id for s in suggestions]:
                    suggestions.append(CategorySuggestion(
                        category_id=category.id,
                        category_name=category.name,
                        confidence=0.85
                    ))
    
    return suggestions