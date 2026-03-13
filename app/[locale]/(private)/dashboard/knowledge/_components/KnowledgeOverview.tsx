"use client";

import { Skeleton } from "antd";

type KnowledgeOverviewProps = {
  title: string | null;
  summary: string | null;
  generating: boolean;
};

export function KnowledgeOverview({ title, summary, generating }: KnowledgeOverviewProps) {
  if (!generating && !title && !summary) return null;

  return (
    <div
      style={{
        padding: "var(--space-4) var(--space-5)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-background)",
      }}
    >
      {generating ? (
        <Skeleton active paragraph={{ rows: 2 }} title={{ width: "40%" }} />
      ) : (
        <>
          {title && (
            <h2
              style={{
                margin: 0,
                marginBottom: "var(--space-2)",
                fontSize: "var(--text-xl)",
                fontWeight: "var(--font-semibold)" as React.CSSProperties["fontWeight"],
                color: "var(--color-text)",
              }}
            >
              {title}
            </h2>
          )}
          {summary && (
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-sm)",
                color: "var(--color-text-muted)",
                lineHeight: 1.7,
              }}
            >
              {summary}
            </p>
          )}
        </>
      )}
    </div>
  );
}
