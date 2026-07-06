from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ArticleOut(BaseModel):
    slug: str
    title: str
    category: str
    cover_url: Optional[str]
    reading_min: int
    tags: Optional[list]
    published_at: Optional[datetime]
    xp_reward: int
    is_read: bool = False

class ArticleDetailOut(ArticleOut):
    content: Optional[str]

class ArticleCompleteOut(BaseModel):
    xp_awarded: int
    total_xp: int
