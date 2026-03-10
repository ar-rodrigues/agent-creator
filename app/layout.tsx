import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Creator",
  description: "Create agents and skills",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("theme");var r="light";if(t==="dark"||t==="light")r=t;else if(window.matchMedia("(prefers-color-scheme: dark)").matches)r="dark";document.documentElement.dataset.theme=r;document.documentElement.style.colorScheme=r})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
