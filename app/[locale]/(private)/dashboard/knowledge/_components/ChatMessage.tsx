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

/** Splits answer text on [N] or [N, M, ...] citation markers and replaces them with SourceBadge(es). */
function renderWithCitations(
  text: string,
  sources: RagSource[],
  documentNameMap: Record<string, string>,
): ReactNode[] {
  const sourceMap: Record<number, RagSource> = {};
  for (const s of sources) sourceMap[s.number] = s;

  const parts = text.split(/(\[\d+(?:,\s*\d+)*\])/g);
  return parts.flatMap((part, i): ReactNode[] => {
    const match = /^\[(\d+(?:,\s*\d+)*)\]$/.exec(part);
    if (match) {
      const nums = match[1].split(",").map((n) => parseInt(n.trim(), 10));
      const badges = nums
        .filter((num) => sourceMap[num])
        .map((num) => (
          <SourceBadge
            key={`${i}-${num}`}
            source={sourceMap[num]}
            filename={documentNameMap[sourceMap[num].documentId]}
          />
        ));
      if (badges.length > 0) return badges;
    }
    return [part];
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
  maxWidth: "100%",
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

  const isEmpty = content === "";
  const nodes =
    sources.length > 0
      ? renderWithCitations(content, sources, documentNameMap)
      : [content];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={ASSISTANT_BUBBLE_STYLE}>
        <div style={{ whiteSpace: "pre-wrap" }}>
          {isEmpty ? (
            <span style={{ color: "var(--color-text-muted)" }}>Thinking…</span>
          ) : (
            nodes
          )}
        </div>
      </div>
    </div>
  );
}
