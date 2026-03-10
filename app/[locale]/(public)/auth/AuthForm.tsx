"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { App, Button, Form, Input, Tabs, Alert } from "antd";
import { useAuth } from "@/hooks/useAuth";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import { Card } from "@/components/ui/Card";
import { Link } from "@/i18n/navigation";
import styles from "./AuthForm.module.css";

type TabKey = "signin" | "signup" | "forgot";

export function AuthForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const { signIn, signUp, resetPassword, error: authError } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const mode = searchParams.get("mode");
    if (mode === "signup") return "signup";
    if (mode === "forgot") return "forgot";
    return "signin";
  });
  const [submitting, setSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const urlError = searchParams.get("error");
  const displayError = urlError ? decodeURIComponent(urlError) : authError;

  const handleSignIn = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    const { error } = await signIn(values.email, values.password);
    setSubmitting(false);
    if (!error) {
      message.success(t("signedInSuccess"));
      router.push("/dashboard");
      return;
    }
  };

  const handleSignUp = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error, needsConfirmation } = await signUp(
      values.email,
      values.password,
      { emailRedirectTo: `${origin}/auth/callback` }
    );
    setSubmitting(false);
    if (!error) {
      if (needsConfirmation) {
        router.replace("/auth/check-email");
      } else {
        message.success(t("accountCreated"));
        router.push("/dashboard");
      }
    }
  };

  const handleForgotPassword = async (values: { email: string }) => {
    setSubmitting(true);
    setForgotSent(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await resetPassword(
      values.email,
      `${origin}/auth/callback`
    );
    setSubmitting(false);
    if (!error) {
      setForgotSent(true);
      message.success(t("resetLinkSent"));
    }
  };

  const tabItems = [
    {
      key: "signin",
      label: t("signIn"),
      children: (
        <Form
          layout="vertical"
          onFinish={handleSignIn}
          style={{ marginTop: "var(--space-4)" }}
        >
          <Form.Item
            name="email"
            label={t("email")}
            rules={[
              { required: true, message: t("enterEmail") },
              { type: "email", message: t("validEmail") },
            ]}
          >
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("password")}
            rules={[{ required: true, message: t("enterPassword") }]}
          >
            <Input.Password
              placeholder={t("passwordPlaceholder")}
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              block
              style={{ marginBottom: "var(--space-2)" }}
            >
              {t("signIn")}
            </Button>
            <Button
              type="link"
              block
              onClick={() => setActiveTab("forgot")}
              style={{ padding: 0 }}
            >
              {t("forgotPassword")}
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "signup",
      label: t("signUp"),
      children: (
        <Form
          layout="vertical"
          onFinish={handleSignUp}
          style={{ marginTop: "var(--space-4)" }}
        >
          <Form.Item
            name="email"
            label={t("email")}
            rules={[
              { required: true, message: t("enterEmail") },
              { type: "email", message: t("validEmail") },
            ]}
          >
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("password")}
            rules={[
              { required: true, message: t("choosePassword") },
              { min: 6, message: t("passwordMinLength") },
            ]}
          >
            <Input.Password
              placeholder={t("passwordPlaceholder")}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              {t("signUp")}
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "forgot",
      label: t("resetPassword"),
      children: (
        <Form
          layout="vertical"
          onFinish={handleForgotPassword}
          style={{ marginTop: "var(--space-4)" }}
        >
          {forgotSent && (
            <Alert
              type="success"
              title={t("emailSent")}
              description={t("emailSentDescription")}
              showIcon
              style={{ marginBottom: "var(--space-4)" }}
            />
          )}
          <Form.Item
            name="email"
            label={t("email")}
            rules={[
              { required: true, message: t("enterEmail") },
              { type: "email", message: t("validEmail") },
            ]}
          >
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              {t("sendResetLink")}
            </Button>
            <Button
              type="link"
              block
              onClick={() => setActiveTab("signin")}
              style={{ marginTop: "var(--space-2)", padding: 0 }}
            >
              {t("backToSignIn")}
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  const titleKey =
    activeTab === "signin"
      ? "signIn"
      : activeTab === "signup"
        ? "signUp"
        : "resetPassword";

  return (
    <Container size="sm">
      <Stack gap="6">
        <Card padding="md">
          <Stack gap="4">
            <h1 className={styles.title}>{t(titleKey)}</h1>
            {displayError && (
              <Alert type="error" title={displayError} showIcon closable />
            )}
            <Tabs
              activeKey={activeTab}
              onChange={(k) => setActiveTab(k as TabKey)}
              items={tabItems}
            />
          </Stack>
        </Card>
        <p className={styles.backLink}>
          <Link href="/">{t("backToHome")}</Link>
        </p>
      </Stack>
    </Container>
  );
}
