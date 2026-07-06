from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlalchemy import func
from typing import List
from datetime import date, datetime

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.content import Article, ArticleRead
from app.models.gamification import Quest, QuestProgress, Streak
from app.schemas.content import ArticleOut, ArticleDetailOut, ArticleCompleteOut
from app.services.gamification import award_xp, touch_streak, evaluate_badges, get_xp

router = APIRouter(prefix="/articles", tags=["content"])

@router.get("", response_model=List[ArticleOut])
async def list_articles(user: User = Depends(get_current_user), db=Depends(get_db)):
    articles_result = await db.exec(
        select(Article)
        .where(Article.published_at != None)
        .order_by(Article.published_at.desc())
    )
    articles = articles_result.all()

    reads_result = await db.exec(
        select(ArticleRead.slug).where(ArticleRead.user_id == user.id)
    )
    read_slugs = set(reads_result.all())

    return [
        ArticleOut(
            slug=a.slug, title=a.title, category=a.category,
            cover_url=a.cover_url, reading_min=a.reading_min,
            tags=a.tags, published_at=a.published_at,
            xp_reward=a.xp_reward, is_read=a.slug in read_slugs,
        )
        for a in articles
    ]

@router.get("/{slug}", response_model=ArticleDetailOut)
async def get_article(slug: str, user: User = Depends(get_current_user), db=Depends(get_db)):
    article = await db.get(Article, slug)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    read_result = await db.exec(
        select(ArticleRead).where(ArticleRead.user_id == user.id, ArticleRead.slug == slug)
    )
    is_read = read_result.first() is not None

    return ArticleDetailOut(
        slug=article.slug, title=article.title, category=article.category,
        cover_url=article.cover_url, reading_min=article.reading_min,
        tags=article.tags, published_at=article.published_at,
        xp_reward=article.xp_reward, is_read=is_read,
        content=article.content,
    )

@router.post("/{slug}/complete", response_model=ArticleCompleteOut)
async def complete_article(slug: str, user: User = Depends(get_current_user), db=Depends(get_db)):
    article = await db.get(Article, slug)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    existing_result = await db.exec(
        select(ArticleRead).where(ArticleRead.user_id == user.id, ArticleRead.slug == slug)
    )
    if existing_result.first():
        xp = await get_xp(db, user.id)
        return ArticleCompleteOut(xp_awarded=0, total_xp=xp.total)

    db.add(ArticleRead(user_id=user.id, slug=slug, xp_awarded=article.xp_reward))
    await touch_streak(db, user.id)
    total = await award_xp(db, user.id, article.xp_reward, "article_read", ref_type="article")

    # progress daily_article quest
    today = date.today()
    quest_result = await db.exec(select(Quest).where(Quest.code == "daily_article"))
    quest = quest_result.first()
    if quest:
        qp_result = await db.exec(
            select(QuestProgress).where(
                QuestProgress.quest_id == quest.id,
                QuestProgress.user_id == user.id,
                QuestProgress.quest_date == today,
            )
        )
        qp = qp_result.first()
        if qp and not qp.completed_at:
            qp.progress = min(qp.progress + 1, qp.target)
            if qp.progress >= qp.target:
                qp.completed_at = datetime.utcnow()
                total = await award_xp(db, user.id, quest.xp_reward, "quest_complete", ref_type="quest", ref_id=quest.id)

    reads_count_result = await db.exec(
        select(func.count()).select_from(ArticleRead).where(ArticleRead.user_id == user.id)
    )
    reads_count = reads_count_result.one()
    streak = await db.get(Streak, user.id)
    streak_days = streak.current if streak else 0
    await evaluate_badges(db, user.id, total, streak_days, reads_count)

    await db.commit()
    return ArticleCompleteOut(xp_awarded=article.xp_reward, total_xp=total)
