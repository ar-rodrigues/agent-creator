"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { App, Button, Modal, Table, Upload } from "antd";
import type { UploadFile } from "antd";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useKnowledgeSpaces } from "@/hooks/useKnowledgeSpaces";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";

export default function KnowledgePage() {
  const t = useTranslations("knowledge");
  const { message } = App.useApp();
  const { currentOrgId, currentOrganization } = useCurrentOrganization();
  const { can } = usePermissions(currentOrgId);
  const { data: spaces, loading, error, refetch } = useKnowledgeSpaces(currentOrgId);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createScope, setCreateScope] = useState<"general" | "project" | "agent">("general");
  const [creating, setCreating] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [uploadSpaces, setUploadSpaces] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const canCreate = can("KNOWLEDGE_SPACE_CREATE");
  const canUpload = can("DOCUMENT_UPLOAD");
  const canRead = can("KNOWLEDGE_SPACE_READ");

  const handleCreate = useCallback(async () => {
    if (!currentOrgId || !createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/knowledge-spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: currentOrgId,
          name: createName.trim(),
          scope: createScope,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create");
      }
      message.success(t("spaceCreated"));
      setCreateModalOpen(false);
      setCreateName("");
      setCreateScope("general");
      refetch();
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("createFailed"));
    } finally {
      setCreating(false);
    }
  }, [currentOrgId, createName, createScope, message, refetch, t]);

  const handleUpload = useCallback(async () => {
    if (!currentOrgId || uploadFileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of uploadFileList) {
        if (!file.originFileObj) continue;
        const form = new FormData();
        form.set("file", file.originFileObj);
        form.set("orgId", currentOrgId);
        form.set("knowledgeSpaceIds", JSON.stringify(uploadSpaces));
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Upload failed");
        }
      }
      message.success(t("documentsUploaded"));
      setUploadModalOpen(false);
      setUploadFileList([]);
      setUploadSpaces([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }, [currentOrgId, uploadFileList, uploadSpaces, message, t]);

  if (!currentOrganization) {
    return (
      <Container size="xl">
        <p>{t("selectOrg")}</p>
      </Container>
    );
  }

  const columns = [
    { title: t("name"), dataIndex: "name", key: "name" },
    { title: t("scope"), dataIndex: "scope", key: "scope" },
    { title: t("created"), dataIndex: "created_at", key: "created_at", render: (d: string) => new Date(d).toLocaleDateString() },
  ];

  return (
    <Container size="xl">
      <Stack gap="lg">
        <h1>{t("title")}</h1>
        {error && (
          <p style={{ color: "var(--color-error)" }}>{error}</p>
        )}
        <Card>
          <Stack gap="md">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canCreate && (
                <Button type="primary" onClick={() => setCreateModalOpen(true)}>
                  {t("createSpace")}
                </Button>
              )}
              {canUpload && (
                <Button onClick={() => setUploadModalOpen(true)}>
                  {t("uploadDocument")}
                </Button>
              )}
            </div>
            {canRead && (
              <Table
                loading={loading}
                dataSource={spaces ?? []}
                columns={columns}
                rowKey="id"
                pagination={false}
                locale={{ emptyText: t("noData") }}
              />
            )}
          </Stack>
        </Card>
      </Stack>

      <Modal
        title={t("createModalTitle")}
        open={createModalOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={creating}
        okButtonProps={{ disabled: !createName.trim() }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>{t("name")}</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t("namePlaceholder")}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>{t("scope")}</label>
            <select
              value={createScope}
              onChange={(e) => setCreateScope(e.target.value as "general" | "project" | "agent")}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="general">{t("scopeGeneral")}</option>
              <option value="project">{t("scopeProject")}</option>
              <option value="agent">{t("scopeAgent")}</option>
            </select>
          </div>
        </Stack>
      </Modal>

      <Modal
        title={t("uploadModalTitle")}
        open={uploadModalOpen}
        onOk={() => void handleUpload()}
        onCancel={() => setUploadModalOpen(false)}
        confirmLoading={uploading}
        okButtonProps={{ disabled: uploadFileList.length === 0 }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>{t("file")}</label>
            <Upload
              multiple
              fileList={uploadFileList}
              beforeUpload={(file) => {
                setUploadFileList((prev) => [...prev, { uid: file.name + Date.now(), name: file.name, status: "done", originFileObj: file }]);
                return false;
              }}
              onRemove={(file) => {
                setUploadFileList((prev) => prev.filter((f) => f.uid !== file.uid));
              }}
            >
              <Button>{t("selectFiles")}</Button>
            </Upload>
          </div>
          {spaces && spaces.length > 0 && (
            <div>
              <label style={{ display: "block", marginBottom: 4 }}>{t("knowledgeSpacesOptional")}</label>
              <select
                multiple
                value={uploadSpaces}
                onChange={(e) => {
                  const opts = Array.from(
                    (e.target as HTMLSelectElement).selectedOptions,
                    (o) => o.value,
                  );
                  setUploadSpaces(opts);
                }}
                style={{ width: "100%", minHeight: 80 }}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.scope})
                  </option>
                ))}
              </select>
            </div>
          )}
        </Stack>
      </Modal>
    </Container>
  );
}
