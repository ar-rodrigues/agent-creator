"use client";

import { useCallback, useState } from "react";
import { App, Button, Modal, Table, Upload } from "antd";
import type { UploadFile } from "antd";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useKnowledgeSpaces } from "@/hooks/useKnowledgeSpaces";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";

export default function KnowledgePage() {
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
      message.success("Knowledge space created");
      setCreateModalOpen(false);
      setCreateName("");
      setCreateScope("general");
      refetch();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }, [currentOrgId, createName, createScope, message, refetch]);

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
      message.success("Document(s) uploaded");
      setUploadModalOpen(false);
      setUploadFileList([]);
      setUploadSpaces([]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [currentOrgId, uploadFileList, uploadSpaces, message]);

  if (!currentOrganization) {
    return (
      <Container>
        <p>Select an organization to manage knowledge spaces.</p>
      </Container>
    );
  }

  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Scope", dataIndex: "scope", key: "scope" },
    { title: "Created", dataIndex: "created_at", key: "created_at", render: (t: string) => new Date(t).toLocaleDateString() },
  ];

  return (
    <Container>
      <Stack gap="lg">
        <h1>Knowledge</h1>
        {error && (
          <p style={{ color: "var(--color-error)" }}>{error}</p>
        )}
        <Card>
          <Stack gap="md">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {canCreate && (
                <Button type="primary" onClick={() => setCreateModalOpen(true)}>
                  Create knowledge space
                </Button>
              )}
              {canUpload && (
                <Button onClick={() => setUploadModalOpen(true)}>
                  Upload document
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
              />
            )}
          </Stack>
        </Card>
      </Stack>

      <Modal
        title="Create knowledge space"
        open={createModalOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={creating}
        okButtonProps={{ disabled: !createName.trim() }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Company guidelines"
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Scope</label>
            <select
              value={createScope}
              onChange={(e) => setCreateScope(e.target.value as "general" | "project" | "agent")}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="general">General</option>
              <option value="project">Project</option>
              <option value="agent">Agent</option>
            </select>
          </div>
        </Stack>
      </Modal>

      <Modal
        title="Upload document"
        open={uploadModalOpen}
        onOk={() => void handleUpload()}
        onCancel={() => setUploadModalOpen(false)}
        confirmLoading={uploading}
        okButtonProps={{ disabled: uploadFileList.length === 0 }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>File</label>
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
              <Button>Select file(s)</Button>
            </Upload>
          </div>
          {spaces && spaces.length > 0 && (
            <div>
              <label style={{ display: "block", marginBottom: 4 }}>Knowledge spaces (optional)</label>
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
