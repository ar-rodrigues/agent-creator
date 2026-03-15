"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { App, Button, Form, Input } from "antd";
import { useAuth } from "@/hooks/useAuth";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import { Card } from "@/components/ui/Card";
import styles from "./page.module.css";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { message } = App.useApp();
  const { user, loading, updatePassword } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  const handleFinish = async (values: {
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (values.newPassword !== values.confirmPassword) return;
    setSubmitting(true);
    const { error } = await updatePassword(values.newPassword);
    setSubmitting(false);
    if (error) {
      message.error(t("passwordUpdateFailed"));
      return;
    }
    message.success(t("passwordUpdated"));
    router.push("/dashboard");
  };

  if (loading || !user) {
    return (
      <Container size="sm">
        <div className={styles.loading}>Loading…</div>
      </Container>
    );
  }

  return (
    <Container size="sm">
      <Stack gap="6">
        <Card padding="lg">
          <Stack gap="4">
            <h1 className={styles.title}>{t("resetPasswordPageTitle")}</h1>
            <p className={styles.description}>
              {t("resetPasswordPageDescription")}
            </p>
            <Form
              layout="vertical"
              onFinish={handleFinish}
              style={{ marginTop: "var(--space-4)" }}
            >
              <Form.Item
                name="newPassword"
                label={t("newPassword")}
                rules={[
                  { required: true, message: t("enterPassword") },
                  {
                    min: 6,
                    message: t("passwordMinLength"),
                  },
                ]}
              >
                <Input.Password
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label={t("confirmPassword")}
                dependencies={["newPassword"]}
                rules={[
                  { required: true, message: t("passwordsMustMatch") },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("newPassword") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(
                        new Error(t("passwordsMustMatch"))
                      );
                    },
                  }),
                ]}
              >
                <Input.Password
                  placeholder={t("passwordPlaceholder")}
                  autoComplete="new-password"
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  block
                >
                  {t("setPassword")}
                </Button>
              </Form.Item>
            </Form>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
