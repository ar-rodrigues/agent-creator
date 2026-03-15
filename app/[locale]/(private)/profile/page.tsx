"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { App, Button, Form, Input } from "antd";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import styles from "./page.module.css";

export default function ProfilePage() {
  const t = useTranslations("profile");
  const { message } = App.useApp();
  const { user, updatePassword, updateEmail } = useAuth();
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const handlePasswordFinish = async (values: {
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (values.newPassword !== values.confirmPassword) return;
    setPasswordSubmitting(true);
    const { error } = await updatePassword(values.newPassword);
    setPasswordSubmitting(false);
    if (error) {
      message.error(t("passwordUpdateFailed"));
      return;
    }
    message.success(t("passwordUpdated"));
  };

  const handleEmailFinish = async (values: { newEmail: string }) => {
    setEmailSubmitting(true);
    const { error } = await updateEmail(values.newEmail);
    setEmailSubmitting(false);
    if (error) {
      message.error(t("emailUpdateFailed"));
      return;
    }
    message.success(t("emailUpdateSent"));
  };

  if (!user) return null;

  return (
    <Container size="xl" className={styles.profileContainer}>
      <Stack gap="6">
        <h1 className={styles.title}>{t("title")}</h1>

        <Card padding="lg">
          <Stack gap="2">
            <h2 className={styles.sectionTitle}>{t("email")}</h2>
            <p className={styles.emailValue}>{user.email ?? "—"}</p>
          </Stack>
        </Card>

        <div className={styles.formsGrid}>
          <Card padding="lg">
            <Stack gap="4">
              <h2 className={styles.sectionTitle}>{t("changePassword")}</h2>
              <Form
                layout="vertical"
                onFinish={handlePasswordFinish}
                className={styles.form}
              >
              <Form.Item
                name="newPassword"
                label={t("newPassword")}
                rules={[
                  { required: true, message: t("passwordsMustMatch") },
                  { min: 6, message: t("passwordMinLength") },
                ]}
              >
                <Input.Password autoComplete="new-password" />
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
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={passwordSubmitting}
                >
                  {t("save")}
                </Button>
              </Form.Item>
            </Form>
            </Stack>
          </Card>

          <Card padding="lg">
            <Stack gap="4">
              <h2 className={styles.sectionTitle}>{t("changeEmail")}</h2>
              <Form
                layout="vertical"
                onFinish={handleEmailFinish}
                className={styles.form}
              >
              <Form.Item
                name="newEmail"
                label={t("newEmail")}
                rules={[
                  { required: true, message: t("enterEmail") },
                  { type: "email", message: t("validEmail") },
                ]}
              >
                <Input type="email" autoComplete="email" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={emailSubmitting}
                >
                  {t("save")}
                </Button>
              </Form.Item>
            </Form>
            </Stack>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}
