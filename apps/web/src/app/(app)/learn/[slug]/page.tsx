"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { ArrowLeft, CheckCircle, Clock, Star } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  keto: "Keto",
  fasting: "Fasting",
  exercise: "Exercise",
  mindfulness: "Mindfulness",
  science: "Science",
};

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown renderer — no external library needed for basic formatting
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="text-lg font-semibold text-charcoal-500 mt-5 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="text-base font-semibold text-charcoal-500 mt-4 mb-1.5">{line.slice(4)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="text-xl font-bold text-charcoal-500 mt-4 mb-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={key++} className="text-sm text-charcoal-500 leading-relaxed ml-4 list-disc">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key++} className="border-l-3 border-mint-300 pl-4 py-1 my-2 text-sm text-muted italic">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-sm text-charcoal-500 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div className="space-y-1">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // **bold** and *italic* inline rendering
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: article, isLoading } = useQuery({
    queryKey: ["article", slug],
    queryFn: () => api.content.getArticle(slug),
  });

  const complete = useMutation({
    mutationFn: () => api.content.completeArticle(slug),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["article", slug] });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: ["me", "xp"] });
      queryClient.invalidateQueries({ queryKey: ["me", "badges"] });
      if (result.xp_awarded > 0) {
        toast(`+${result.xp_awarded} XP — ${t("learn.xpEarned")}`, "success");
      } else {
        toast(t("learn.alreadyRead"), "info");
      }
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-4">
        <div className="h-8 w-32 rounded-lg bg-surface-2 animate-pulse" />
        <div className="h-6 w-64 rounded-lg bg-surface-2 animate-pulse" />
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-4 rounded-lg bg-surface-2 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!article) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-charcoal-500 transition-colors"
      >
        <ArrowLeft size={15} strokeWidth={1.6} />
        {t("learn.title")}
      </button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="mint" className="text-xs">
            {CATEGORY_LABELS[article.category] ?? article.category}
          </Badge>
          {article.is_read && (
            <span className="flex items-center gap-1 text-xs text-mint-600">
              <CheckCircle size={12} strokeWidth={2} />
              {t("learn.read")}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-charcoal-500 leading-snug tracking-tight">
          {article.title}
        </h1>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={1.6} />
            {article.reading_min} {t("learn.min")}
          </span>
          <span className="flex items-center gap-1 text-gold-600">
            <Star size={12} strokeWidth={1.6} />
            +{article.xp_reward} XP
          </span>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="pt-5 pb-5">
          {article.content ? (
            <MarkdownContent content={article.content} />
          ) : (
            <p className="text-sm text-muted">{t("learn.noContent")}</p>
          )}
        </CardContent>
      </Card>

      {/* Complete button */}
      <Button
        size="lg"
        className="w-full gap-2"
        onClick={() => complete.mutate()}
        disabled={complete.isPending}
      >
        <CheckCircle size={16} strokeWidth={1.8} />
        {article.is_read ? t("learn.alreadyRead") : t("learn.markComplete")}
      </Button>
    </div>
  );
}
