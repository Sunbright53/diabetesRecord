from sqlmodel import select
from sqlalchemy import func
from datetime import date, timedelta
from uuid import UUID

from app.db.session import AsyncSession
from app.models.gamification import XPLedger, Streak, Badge, UserBadge, Quest, QuestProgress
from app.schemas.gamification import XPOut, StreakOut

XP_PER_LEVEL = 100

LEVEL_NAMES = [
    "Newcomer", "Explorer", "Athlete", "Champion",
    "Elite", "Master", "Grandmaster", "Legend",
]

def _level_info(total: int) -> XPOut:
    level = total // XP_PER_LEVEL
    xp_in = total % XP_PER_LEVEL
    name = LEVEL_NAMES[min(level, len(LEVEL_NAMES) - 1)]
    return XPOut(
        total=total,
        level=level + 1,
        level_name=name,
        xp_in_level=xp_in,
        xp_to_next=XP_PER_LEVEL - xp_in,
    )

async def get_xp(db: AsyncSession, user_id: UUID) -> XPOut:
    result = await db.exec(
        select(func.coalesce(func.sum(XPLedger.delta), 0))
        .where(XPLedger.user_id == user_id)
    )
    total = result.one()
    return _level_info(int(total))

async def award_xp(
    db: AsyncSession,
    user_id: UUID,
    delta: int,
    reason: str,
    ref_type: str | None = None,
    ref_id: UUID | None = None,
) -> int:
    entry = XPLedger(user_id=user_id, delta=delta, reason=reason, ref_type=ref_type, ref_id=ref_id)
    db.add(entry)
    await db.flush()
    xp = await get_xp(db, user_id)
    return xp.total

async def get_streak(db: AsyncSession, user_id: UUID) -> StreakOut:
    streak = await db.get(Streak, user_id)
    if not streak:
        return StreakOut(current=0, longest=0, last_active_date=None, freezes_left=2)
    return StreakOut(
        current=streak.current,
        longest=streak.longest,
        last_active_date=streak.last_active_date,
        freezes_left=streak.freezes_left,
    )

async def touch_streak(db: AsyncSession, user_id: UUID) -> StreakOut:
    today = date.today()
    streak = await db.get(Streak, user_id)

    if not streak:
        streak = Streak(user_id=user_id, current=1, longest=1, last_active_date=today)
        db.add(streak)
    elif streak.last_active_date == today:
        pass  # already active today
    elif streak.last_active_date == today - timedelta(days=1):
        streak.current += 1
        if streak.current > streak.longest:
            streak.longest = streak.current
        streak.last_active_date = today
    else:
        gap = (today - streak.last_active_date).days if streak.last_active_date else 999
        if gap == 2 and streak.freezes_left > 0:
            streak.current += 1
            streak.freezes_left -= 1
            streak.last_active_date = today
        else:
            streak.current = 1
            streak.last_active_date = today

    await db.flush()
    return StreakOut(
        current=streak.current,
        longest=streak.longest,
        last_active_date=streak.last_active_date,
        freezes_left=streak.freezes_left,
    )

BADGE_CRITERIA = {
    "streak_7":     lambda xp, streak, reads: streak >= 7,
    "streak_30":    lambda xp, streak, reads: streak >= 30,
    "streak_100":   lambda xp, streak, reads: streak >= 100,
    "reader":       lambda xp, streak, reads: reads >= 5,
    "scholar":      lambda xp, streak, reads: reads >= 20,
    "level_10":     lambda xp, streak, reads: xp >= 10 * XP_PER_LEVEL,
    "level_50":     lambda xp, streak, reads: xp >= 50 * XP_PER_LEVEL,
}

async def evaluate_badges(db: AsyncSession, user_id: UUID, total_xp: int, streak_days: int, article_reads: int) -> list[str]:
    awarded_result = await db.exec(
        select(UserBadge.badge_id).where(UserBadge.user_id == user_id)
    )
    already_owned = set(awarded_result.all())

    badges_result = await db.exec(select(Badge))
    all_badges = {b.id: b for b in badges_result.all()}

    newly_awarded = []
    for badge_id, badge in all_badges.items():
        if badge_id in already_owned:
            continue
        criteria_fn = BADGE_CRITERIA.get(badge.code)
        if criteria_fn and criteria_fn(total_xp, streak_days, article_reads):
            db.add(UserBadge(user_id=user_id, badge_id=badge_id))
            newly_awarded.append(badge.code)

    if newly_awarded:
        await db.flush()
    return newly_awarded
