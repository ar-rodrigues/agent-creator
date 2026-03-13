"use client";

import { Tooltip } from "antd";
import type { RagSource } from "@/hooks/useRagGeneral";

type SourceBadgeProps = {
  source: RagSource;
  filename?: string;
};

export function SourceBadge({ source, filename }: SourceBadgeProps) {
  const excerpt =
    source.content.length > 200
      ? source.content.slice(0, 200).trimEnd() + "…"
      : source.content;

  const tooltipContent = (
    <div style={{ maxWidth: 320 }}>
      {filename && (
        <div
          style={{
            fontWeight: "var(--font-semibold)" as React.CSSProperties["fontWeight"],
            fontSize: "var(--text-xs)",
            marginBottom: "var(--space-1)",
            opacity: 0.8,
          }}
        >
          {filename}
        </div>
      )}
      <div style={{ fontSize: "var(--text-xs)", lineHeight: 1.5 }}>{excerpt}</div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top">
      <sup
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 16,
          height: 16,
          padding: "0 4px",
          fontSize: 10,
          fontWeight: "var(--font-semibold)" as React.CSSProperties["fontWeight"],
          lineHeight: 1,
          color: "var(--color-surface)",
          background: "var(--color-primary)",
          borderRadius: "var(--radius-full)",
          cursor: "default",
          userSelect: "none",
          verticalAlign: "super",
          marginInline: 1,
        }}
      >
        {source.number}
      </sup>
    </Tooltip>
  );
}
