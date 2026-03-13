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
  maxHeight: "60vh",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.7,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
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
        <div
          style={{
            whiteSpace: "pre-wrap",
            overflowY: "auto",
            minHeight: 0,
            flex: "1 1 auto",
          }}
        >
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
