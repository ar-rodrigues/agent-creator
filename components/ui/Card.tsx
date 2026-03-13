import type { ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  style?: React.CSSProperties;
};

export function Card({
  children,
  className = "",
  padding = "md",
  style,
}: CardProps) {
  return (
    <div
      className={`${styles.card} ${styles[padding]} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
