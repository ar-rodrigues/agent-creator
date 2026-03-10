import type { ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

export function Card({
  children,
  className = "",
  padding = "md",
}: CardProps) {
  return (
    <div className={`${styles.card} ${styles[padding]} ${className}`.trim()}>
      {children}
    </div>
  );
}
