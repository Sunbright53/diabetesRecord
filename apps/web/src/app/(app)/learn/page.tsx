"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ArticleOut } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { BookOpen, CheckCircle, Clock } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  keto: "Keto",
  fasting: "Fasting",
  exercise: "Exercise",
  mindfulness: "Mindfulness",
  science: "Science",
};

function ArticleCard({ article }: { article: ArticleOut }) {
  const { t } = useT();
  return (
    <Link href={`/learn/${article.slug}`}>
      <Card className="hover:border-mint-200 transition-colors cursor-pointer">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge variant="mint" className="text-xs px-2 py-0.5">
                  {CATEGORY_LABELS[article.category] ?? article.category}
                </Badge>
                {article.is_read && (
                  <span className="flex items-center gap-1 text-xs text-mint-600">
                    <CheckCircle size={11} strokeWidth={2} />
                    {t("learn.read")}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-charcoal-500 leading-snug line-clamp-2">
                {article.title}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <Clock size={11} strokeWidth={1.6} />
                  {article.reading_min} {t("learn.min")}
                </span>
                <span className="text-gold-600 font-medium">+{article.xp_reward} XP</span>
              </div>
            </div>
            {article.is_read ? (
              <CheckCircle size={18} className="text-mint-500 mt-0.5 shrink-0" strokeWidth={1.8} />
            ) : (
              <BookOpen size={18} className="text-muted mt-0.5 shrink-0" strokeWidth={1.6} />
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function LearnPage() {
  const { t } = useT();
  const { data: articles, isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: api.content.listArticles,
  });

  const read = articles?.filter((a) => a.is_read).length ?? 0;
  const total = articles?.length ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-charcoal-500 tracking-tight">{t("learn.title")}</h1>
        {total > 0 && (
          <p className="text-sm text-muted mt-1">
            {t("learn.progress", { read, total })}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-2 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && articles?.length === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <BookOpen size={32} className="mx-auto text-muted mb-3" strokeWidth={1.3} />
            <p className="text-sm text-muted">{t("learn.empty")}</p>
          </CardContent>
        </Card>
      )}

      {articles && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((a) => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
