"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { App, Button, Modal, Popconfirm } from "antd";
import { PlusOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useKnowledgeSpaces } from "@/hooks/useKnowledgeSpaces";
import { useGeneralDocuments } from "@/hooks/useGeneralDocuments";
import { useRagGeneral } from "@/hooks/useRagGeneral";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import { ChatMessage } from "./_components/ChatMessage";
import { KnowledgeOverview } from "./_components/KnowledgeOverview";
import type { ChatEntry } from "./_components/ChatMessage";

const SIDEBAR_WIDTH = 260;

async function triggerSummaryUpdate(spaceId: string, locale: string): Promise<void> {
  await fetch(`/api/knowledge-spaces/${spaceId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
}

export default function KnowledgePage() {
  const t = useTranslations("knowledge");
  const locale = useLocale();
  const { message } = App.useApp();
  const { currentOrgId, currentOrganization } = useCurrentOrganization();
  const { can } = usePermissions(currentOrgId);
  const { data: spaces, refetch: refetchSpaces } = useKnowledgeSpaces(currentOrgId);
  const {
    data: documents,
    loading: docsLoading,
    error: docsError,
    refetch: refetchDocs,
  } = useGeneralDocuments(currentOrgId);
  const { loading: ragLoading, askStreaming: askRagStreaming } = useRagGeneral();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const canCreate = can("KNOWLEDGE_SPACE_CREATE");
  const canUpload = can("DOCUMENT_UPLOAD");
  const canRead = can("KNOWLEDGE_SPACE_READ");

  const generalSpaces = (spaces ?? []).filter((s) => s.scope === "general");
  const firstGeneralSpace = generalSpaces[0] ?? null;

  const documentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (documents ?? []).forEach((doc) => {
      map[doc.id] = doc.filename;
    });
    return map;
  }, [documents]);

  // Auto-scroll to newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ragLoading]);

  const refreshSummary = useCallback(
    async (spaceId: string) => {
      setGeneratingSummary(true);
      try {
        await triggerSummaryUpdate(spaceId, locale);
        await refetchSpaces();
      } finally {
        setGeneratingSummary(false);
      }
    },
    [locale, refetchSpaces],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!currentOrgId || !firstGeneralSpace || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of files) {
          const form = new FormData();
          form.set("file", file);
          form.set("orgId", currentOrgId);
          form.set("knowledgeSpaceIds", JSON.stringify([firstGeneralSpace.id]));
          const res = await fetch("/api/documents/upload", {
            method: "POST",
            body: form,
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(payload?.error ?? t("uploadFailed"));
          }
        }
        await refetchDocs();
        message.success(t("documentsUploaded"));
        void refreshSummary(firstGeneralSpace.id);
      } catch (err) {
        message.error(err instanceof Error ? err.message : t("uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [currentOrgId, firstGeneralSpace, message, refetchDocs, refreshSummary, t],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      void uploadFiles(Array.from(files));
      e.target.value = "";
    },
    [uploadFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) void uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

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
          scope: "general",
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? t("createFailed"));
      }
      message.success(t("spaceCreated"));
      setCreateModalOpen(false);
      setCreateName("");
      refetchSpaces();
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("createFailed"));
    } finally {
      setCreating(false);
    }
  }, [currentOrgId, createName, message, refetchSpaces, t]);

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeletingId(documentId);
      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? t("deleteFailed"));
        }
        message.success(t("documentDeleted"));
        await refetchDocs();
        if (firstGeneralSpace) void refreshSummary(firstGeneralSpace.id);
      } catch (err) {
        message.error(err instanceof Error ? err.message : t("deleteFailed"));
      } finally {
        setDeletingId(null);
      }
    },
    [firstGeneralSpace, message, refetchDocs, refreshSummary, t],
  );

  const handleAsk = useCallback(async () => {
    if (!currentOrgId || !question.trim() || ragLoading) return;
    const userQuestion = question.trim();
    setQuestion("");

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userQuestion },
      { role: "assistant", content: "" },
    ]);

    abortControllerRef.current = new AbortController();

    await askRagStreaming(
      {
        orgId: currentOrgId,
        question: userQuestion,
        knowledgeSpaceIds: [],
      },
      {
        signal: abortControllerRef.current.signal,
        onChunk: (text) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next.length - 1;
            if (last >= 0 && next[last].role === "assistant") {
              next[last] = { ...next[last], content: next[last].content + text };
            }
            return next;
          });
        },
        onDone: ({ sources }) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next.length - 1;
            if (last >= 0 && next[last].role === "assistant") {
              const current = next[last];
              next[last] = {
                ...current,
                content: current.content || "No answer generated.",
                sources,
                documentNameMap,
              };
            }
            return next;
          });
        },
        onError: (error) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next.length - 1;
            if (last >= 0 && next[last].role === "assistant") {
              const current = next[last];
              next[last] = {
                ...current,
                content:
                  error === "Cancelled"
                    ? current.content || "Stopped."
                    : "Something went wrong. Please try again.",
              };
            }
            return next;
          });
        },
      },
    );
  }, [askRagStreaming, currentOrgId, documentNameMap, question, ragLoading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleAsk();
      }
    },
    [handleAsk],
  );

  if (!currentOrganization) {
    return (
      <Container size="xl">
        <p>{t("selectOrg")}</p>
      </Container>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Container
        size="xl"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />

        <div
          style={{
            display: "flex",
            gap: "var(--space-6)",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
        {/* Left sidebar */}
        <aside
          style={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Card
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <h2
              style={{
                margin: 0,
                marginBottom: "var(--space-4)",
                fontSize: "var(--text-base)",
                fontWeight: "var(--font-semibold)" as React.CSSProperties["fontWeight"],
              }}
            >
              {t("sourcesListTitle")}
            </h2>

            {docsError && (
              <p
                style={{
                  color: "var(--color-error)",
                  margin: 0,
                  fontSize: "var(--text-sm)",
                }}
              >
                {docsError}
              </p>
            )}

            {canUpload && generalSpaces.length > 0 && (
              <div style={{ marginBottom: "var(--space-4)" }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  block
                  style={{ marginBottom: "var(--space-2)" }}
                >
                  {uploading ? t("indexingDocument") : t("addSources")}
                </Button>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    fontSize: "0.8125rem",
                    color: "var(--color-text-muted)",
                    textAlign: "center",
                    border: "1px dashed var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-background)",
                  }}
                >
                  {t("dropFilesHere")}
                </div>
              </div>
            )}

            {canRead && generalSpaces.length > 0 && (
              <>
                {docsLoading ? (
                  <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>…</p>
                ) : (documents ?? []).length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-sm)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {t("sourcesEmptyHint")}
                  </p>
                ) : (
                  <ul
                    style={{
                      flex: 1,
                      overflow: "auto",
                      minHeight: 0,
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                    }}
                  >
                    {(documents ?? []).map((doc, index, arr) => (
                      <li
                        key={doc.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingBlock: 6,
                          paddingInline: 0,
                          gap: "var(--space-2)",
                          borderBottom:
                            index < arr.length - 1
                              ? "1px solid var(--color-border)"
                              : undefined,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: "var(--font-medium)" as React.CSSProperties["fontWeight"],
                              fontSize: "var(--text-sm)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {doc.filename}
                          </div>
                          <div
                            style={{
                              fontSize: "var(--text-xs)",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {canUpload && (
                          <Popconfirm
                            title={t("deleteConfirm")}
                            onConfirm={() => void handleDelete(doc.id)}
                            okText={t("delete")}
                            cancelButtonProps={{ style: { display: "none" } }}
                          >
                            <Button
                              type="text"
                              size="small"
                              danger
                              loading={deletingId === doc.id}
                            >
                              {t("delete")}
                            </Button>
                          </Popconfirm>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {generalSpaces.length === 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-sm)",
                  color: "var(--color-text-muted)",
                }}
              >
                {t("sourcesEmptyHint")}
              </p>
            )}
          </Card>
        </aside>

        {/* Main chat area */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {generalSpaces.length === 0 ? (
            <Card
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 320,
              }}
            >
              <Stack gap="6" style={{ textAlign: "center", maxWidth: 360 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-base)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {t("createSpaceToStart")}
                </p>
                {canCreate && (
                  <Button
                    type="primary"
                    size="large"
                    onClick={() => setCreateModalOpen(true)}
                  >
                    {t("createSpace")}
                  </Button>
                )}
                {!canCreate && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--text-sm)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {t("noGeneralSpaceAdmin")}
                  </p>
                )}
              </Stack>
            </Card>
          ) : (
            <Card
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                padding: 0,
                overflow: "hidden",
              }}
            >
              {/* Knowledge overview (title + summary) */}
              <KnowledgeOverview
                title={firstGeneralSpace?.summary_title ?? null}
                summary={firstGeneralSpace?.summary ?? null}
                generating={generatingSummary}
              />

              {/* Scrollable messages area */}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                  padding: "var(--space-5)",
                  minHeight: 0,
                }}
              >
                {messages.length === 0 && !ragLoading && (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    {(documents ?? []).length === 0
                      ? t("sourcesEmptyHint")
                      : t("questionPlaceholder")}
                  </div>
                )}

                {messages.map((entry, i) => (
                  <ChatMessage key={i} entry={entry} />
                ))}

                <div ref={chatEndRef} />
              </div>

              {/* Input area: single message box with button inside */}
              <div
                style={{
                  borderTop: "1px solid var(--color-border)",
                  padding: "var(--space-4)",
                  background: "var(--color-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0,
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--color-input-bg)",
                    paddingTop: "var(--space-2)",
                    paddingBottom: "var(--space-2)",
                    paddingLeft: "var(--space-3)",
                    paddingRight: "var(--space-2)",
                    minHeight: 44,
                  }}
                >
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("typeQuestion")}
                    rows={1}
                    style={{
                      flex: 1,
                      resize: "none",
                      padding: "var(--space-1) 0",
                      border: "none",
                      borderRadius: 0,
                      background: "transparent",
                      color: "var(--color-text)",
                      fontSize: "var(--text-sm)",
                      lineHeight: 1.5,
                      outline: "none",
                      minHeight: 24,
                      maxHeight: 120,
                      overflowY: "auto",
                      fontFamily: "var(--font-sans)",
                      scrollbarWidth: "none",
                    }}
                    className="knowledge-chat-input"
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                    }}
                  />
                  {ragLoading ? (
                    <Button
                      icon={<StopOutlined />}
                      onClick={() => abortControllerRef.current?.abort()}
                      title={t("stop")}
                      className="knowledge-chat-stop-btn"
                      style={{
                        flexShrink: 0,
                        width: 40,
                        height: 40,
                        minWidth: 40,
                        padding: 0,
                        borderRadius: "var(--radius-full)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  ) : (
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={() => void handleAsk()}
                      disabled={!question.trim()}
                      title={t("send")}
                      style={{
                        flexShrink: 0,
                        width: 40,
                        height: 40,
                        minWidth: 40,
                        padding: 0,
                        borderRadius: "var(--radius-full)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  )}
                </div>
              </div>
            </Card>
          )}
        </main>
        </div>

        <Modal
        title={t("createModalTitle")}
        open={createModalOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={creating}
        okButtonProps={{ disabled: !createName.trim() }}
      >
        <Stack gap="4">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>
              {t("name")}
            </label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t("namePlaceholder")}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-sm)",
              color: "var(--color-text-muted)",
            }}
          >
            {t("createSpaceGeneralHint")}
          </p>
        </Stack>
      </Modal>
      </Container>
    </div>
  );
}
