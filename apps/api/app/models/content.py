from sqlmodel import SQLModel, Field
from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from uuid import UUID
from datetime import datetime
from typing import Optional

class Article(SQLModel, table=True):
    __tablename__ = "articles"

    slug: str = Field(primary_key=True, max_length=200)
    title: str = Field(max_length=200)
    category: str = Field(max_length=50, index=True)  # keto|fasting|exercise|mindfulness
    cover_url: Optional[str] = Field(default=None, max_length=512)
    reading_min: int = Field(default=3)
    tags: Optional[list] = Field(default=None, sa_column=Column(JSONB))
    mdx_path: str = Field(default="", max_length=300)
    content: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    published_at: Optional[datetime] = None
    xp_reward: int = Field(default=10)

class ArticleRead(SQLModel, table=True):
    __tablename__ = "article_reads"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True)
    slug: str = Field(foreign_key="articles.slug", primary_key=True)
    read_at: datetime = Field(default_factory=datetime.utcnow)
    xp_awarded: int = Field(default=0)
