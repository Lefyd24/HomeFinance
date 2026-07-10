def test_notification_settings_defaults(db, seed_user):
    from app.models.notification import NotificationSettings
    s = NotificationSettings(user_id=seed_user.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    assert s.email_enabled is True
    assert s.default_days_before == 3
