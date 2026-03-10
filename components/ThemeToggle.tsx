"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={styles.wrapper} role="group" aria-label="Theme">
      <button
        type="button"
        className={styles.button}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
        title="Light"
      >
        <Sun className={styles.icon} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
        title="Dark"
      >
        <Moon className={styles.icon} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-pressed={theme === "system"}
        onClick={() => setTheme("system")}
        title="System"
      >
        <Monitor className={styles.icon} aria-hidden />
      </button>
    </div>
  );
}
