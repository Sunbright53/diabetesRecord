# Import all models here so SQLModel.metadata and Alembic can discover them
from app.models.user import User, Profile, Questionnaire
from app.models.health import Device, SensorReading, KetoneLog, WeightLog, MealLog, ActivityLog
from app.models.gamification import XPLedger, Streak, Badge, UserBadge, Quest, QuestProgress, League, LeagueMember
from app.models.social import Friendship, FriendCode, Challenge, ChallengeScore
from app.models.content import Article, ArticleRead
from app.models.notification import PushSubscription, Reminder, NotificationLog
from app.models.ai import AIProvider, AISession, AIMessage, AICallLog

__all__ = [
    "User", "Profile", "Questionnaire",
    "Device", "SensorReading", "KetoneLog", "WeightLog", "MealLog", "ActivityLog",
    "XPLedger", "Streak", "Badge", "UserBadge", "Quest", "QuestProgress", "League", "LeagueMember",
    "Friendship", "FriendCode", "Challenge", "ChallengeScore",
    "Article", "ArticleRead",
    "PushSubscription", "Reminder", "NotificationLog",
    "AIProvider", "AISession", "AIMessage", "AICallLog",
]
