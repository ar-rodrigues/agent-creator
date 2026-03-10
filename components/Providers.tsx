"use client";

import { App, ConfigProvider } from "antd";
import { theme } from "antd";
import type { ReactNode } from "react";
import { ThemeProvider, useTheme } from "./ThemeProvider";

const { defaultAlgorithm, darkAlgorithm } = theme;

function AntThemeConfig({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <ConfigProvider
      theme={{
        algorithm: resolvedTheme === "dark" ? darkAlgorithm : defaultAlgorithm,
        token: {
          colorPrimary: "var(--color-primary)",
          borderRadius: 6,
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AntThemeConfig>{children}</AntThemeConfig>
    </ThemeProvider>
  );
}
