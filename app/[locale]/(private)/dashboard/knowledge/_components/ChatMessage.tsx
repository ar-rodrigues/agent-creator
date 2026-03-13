"use client";

import type { ReactNode } from "react";
import type { RagSource } from "@/hooks/useRagGeneral";
import { SourceBadge } from "./SourceBadge";

export type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
  documentNameMap?: Record<string, string>;
};

type ChatMessageProps = {
  entry: ChatEntry;
};

/** Splits answer text on [N] citation markers and replaces them with SourceBadge. */
function renderWithCitations(
  text: string,
  sources: RagSource[],
  documentNameMap: Record<string, string>,
): ReactNode[] {
  const sourceMap: Record<number, RagSource> = {};
  for (const s of sources) sourceMap[s.number] = s;

  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (match) {
      const num = parseInt(match[1], 10);
      const source = sourceMap[num];
      if (source) {
        return (
          <SourceBadge
            key={i}
            source={source}
            filename={documentNameMap[source.documentId]}
          />
        );
      }
    }
    return part;
  });
}

const USER_BUBBLE_STYLE: React.CSSProperties = {
  alignSelf: "flex-end",
  maxWidth: "75%",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)",
  background: "var(--color-primary)",
  color: "var(--color-surface)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const ASSISTANT_BUBBLE_STYLE: React.CSSProperties = {
  alignSelf: "flex-start",
  maxWidth: "85%",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.7,
};

export function ChatMessage({ entry }: ChatMessageProps) {
  const { role, content, sources = [], documentNameMap = {} } = entry;

  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={USER_BUBBLE_STYLE}>{content}</div>
      </div>
    );
  }

  const nodes = sources.length > 0
    ? renderWithCitations(content, sources, documentNameMap)
    : [content];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={ASSISTANT_BUBBLE_STYLE}>
        <div style={{ whiteSpace: "pre-wrap" }}>{nodes}</div>

        {sources.length > 0 && (
          <div
            style={{
              marginTop: "var(--space-3)",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
            }}
          >
            {sources.map((s) => (
              <div
                key={`${s.documentId}-${s.chunkIndex}`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--space-2)",
                  fontSize: "var(--text-xs)",
                  color: "var(--color-text-muted)",
                }}
              >
                <SourceBadge
                  source={s}
                  filename={documentNameMap[s.documentId]}
                />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {documentNameMap[s.documentId] ?? s.documentId}
                  {typeof s.score === "number"
                    ? ` · ${(s.score * 100).toFixed(1)}%`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
