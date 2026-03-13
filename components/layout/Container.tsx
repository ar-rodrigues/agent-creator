import type { CSSProperties, ReactNode } from "react";
import styles from "./Container.module.css";

type ContainerProps = {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  style?: CSSProperties;
};

export function Container({
  children,
  size = "md",
  className = "",
  style,
}: ContainerProps) {
  return (
    <div
      className={`${styles.container} ${styles[size]} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
