"use client";

import { useState } from "react";
import { App, Button, Form, Input, Typography } from "antd";
import { useRouter } from "@/i18n/navigation";

type Props = {
  onCreated?: () => void;
};

export function OrgCreateForm({ onCreated }: Props) {
  const { message } = App.useApp();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (values: { name: string }) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/orgs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: values.name }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to create organization");
      }

      message.success("Organization created");
      onCreated?.();
      router.push("/dashboard");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to create organization",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2}>Create organization</Typography.Title>
      <Typography.Paragraph>
        Create your first organization to start managing agents, skills, and knowledge
        spaces.
      </Typography.Paragraph>
      <Form
        layout="vertical"
        onFinish={values => {
          void handleFinish(values as {name: string});
        }}
      >
        <Form.Item
          label="Organization name"
          name="name"
          rules={[{required: true, message: "Please enter an organization name"}]}
        >
          <Input placeholder="Acme Corp" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            Create organization
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

