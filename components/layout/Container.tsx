import type { ReactNode } from "react";
import styles from "./Container.module.css";

type ContainerProps = {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

export function Container({
  children,
  size = "md",
  className = "",
}: ContainerProps) {
  return (
    <div className={`${styles.container} ${styles[size]} ${className}`.trim()}>
      {children}
    </div>
  );
}
