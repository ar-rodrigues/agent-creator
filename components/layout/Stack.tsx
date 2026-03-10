import type { ReactNode } from "react";
import styles from "./Stack.module.css";

type Direction = "row" | "column";
type Gap = "1" | "2" | "3" | "4" | "6" | "8";

type StackProps = {
  children: ReactNode;
  direction?: Direction;
  gap?: Gap;
  className?: string;
  as?: "div" | "section";
};

const gapMap: Record<Gap, string> = {
  "1": "var(--space-1)",
  "2": "var(--space-2)",
  "3": "var(--space-3)",
  "4": "var(--space-4)",
  "6": "var(--space-6)",
  "8": "var(--space-8)",
};

export function Stack({
  children,
  direction = "column",
  gap = "4",
  className = "",
  as: Component = "div",
}: StackProps) {
  return (
    <Component
      className={`${styles.stack} ${className}`.trim()}
      style={
        {
          "--stack-direction": direction,
          "--stack-gap": gapMap[gap],
        } as React.CSSProperties
      }
    >
      {children}
    </Component>
  );
}
