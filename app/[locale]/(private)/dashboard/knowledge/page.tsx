"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { App, Button, Modal, Popconfirm, Tooltip } from "antd";
import { PlusOutlined, SendOutlined } from "@ant-design/icons";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useKnowledgeSpaces } from "@/hooks/useKnowledgeSpaces";
import { useGeneralDocuments } from "@/hooks/useGeneralDocuments";
import { useRagGeneral } from "@/hooks/useRagGeneral";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";
import { estimateTokens, CONTEXT_WINDOW_MAX_TOKENS } from "@/lib/utils/tokens";
import { ChatMessage } from "./_components/ChatMessage";
import { KnowledgeOverview } from "./_components/KnowledgeOverview";
import type { ChatEntry } from "./_components/ChatMessage";

const SIDEBAR_WIDTH = 260;

async function triggerSummaryUpdate(spaceId: string, locale: string): Promise<void> {
  const res = await fetch(`/api/knowledge-spaces/${spaceId}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Summary refresh failed for locale ${locale}`);
  }
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
  const lazySummaryRequestedRef = useRef<Set<string>>(new Set());
  const summaryInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFileIndex, setUploadingFileIndex] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [uploadingTotal, setUploadingTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const canCreate = can("KNOWLEDGE_SPACE_CREATE");
  const canUpload = can("DOCUMENT_UPLOAD");
  const canRead = can("KNOWLEDGE_SPACE_READ");

  const generalSpaces = (spaces ?? []).filter((s) => s.scope === "general");
  const firstGeneralSpace = generalSpaces[0] ?? null;

  const overviewTitle = useMemo(() => {
    const loc = firstGeneralSpace?.summary_i18n?.[locale];
    const fallback = firstGeneralSpace?.summary_i18n?.en;
    return loc?.title ?? fallback?.title ?? null;
  }, [locale, firstGeneralSpace]);
  const overviewSummary = useMemo(() => {
    const loc = firstGeneralSpace?.summary_i18n?.[locale];
    const fallback = firstGeneralSpace?.summary_i18n?.en;
    return loc?.summary ?? fallback?.summary ?? null;
  }, [locale, firstGeneralSpace]);

  const documentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (documents ?? []).forEach((doc) => {
      map[doc.id] = doc.filename;
    });
    return map;
  }, [documents]);

  const contextUsedTokens = useMemo(() => {
    const fromMessages = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );
    const fromQuestion = estimateTokens(question);
    return fromMessages + fromQuestion;
  }, [messages, question]);

  const contextPercent = Math.min(
    100,
    (contextUsedTokens / CONTEXT_WINDOW_MAX_TOKENS) * 100,
  );

  const runSummaryUpdate = useCallback(async (spaceId: string, targetLocale: string) => {
    const key = `${spaceId}:${targetLocale}`;
    const existing = summaryInFlightRef.current.get(key);
    if (existing) {
      await existing;
      return;
    }

    const task = triggerSummaryUpdate(spaceId, targetLocale);
    summaryInFlightRef.current.set(key, task);
    try {
      await task;
    } finally {
      if (summaryInFlightRef.current.get(key) === task) {
        summaryInFlightRef.current.delete(key);
      }
    }
  }, []);

  // Auto-scroll to newest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ragLoading]);

  // Lazy-generate summary for current locale when missing (e.g. existing space viewed in another language)
  useEffect(() => {
    const spaceId = firstGeneralSpace?.id;
    const i18n = firstGeneralSpace?.summary_i18n;
    if (!spaceId || !i18n) return;

    const key = `${spaceId}:${locale}`;
    if (lazySummaryRequestedRef.current.has(key)) return;

    const hasCurrent = i18n[locale]?.title || i18n[locale]?.summary;
    const hasAny = Object.keys(i18n).some((loc) => i18n[loc]?.title || i18n[loc]?.summary);
    if (hasCurrent || !hasAny) return;

    lazySummaryRequestedRef.current.add(key);
    void (async () => {
      try {
        await runSummaryUpdate(spaceId, locale);
        await refetchSpaces();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("Lazy summary refresh failed", msg);
        message.warning(msg);
      }
    })();
  }, [locale, firstGeneralSpace, message, refetchSpaces, runSummaryUpdate]);

  const refreshSummary = useCallback(
    async (spaceId: string) => {
      setGeneratingSummary(true);
      try {
        await runSummaryUpdate(spaceId, locale);
        await refetchSpaces();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(msg);
      } finally {
        setGeneratingSummary(false);
      }
    },
    [locale, message, refetchSpaces, runSummaryUpdate],
  );

  const refreshSummaryBothLocales = useCallback(
    async (spaceId: string) => {
      setGeneratingSummary(true);
      try {
        await runSummaryUpdate(spaceId, "en");
        await runSummaryUpdate(spaceId, "es");
        await refetchSpaces();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(msg);
      } finally {
        setGeneratingSummary(false);
      }
    },
    [message, refetchSpaces, runSummaryUpdate],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!currentOrgId || !firstGeneralSpace || files.length === 0) return;
      setUploading(true);
      setUploadingTotal(files.length);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadingFileIndex(i + 1);
          setUploadingFileName(file.name);
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
        setGeneratingSummary(true);
        try {
          await refreshSummaryBothLocales(firstGeneralSpace.id);
        } catch (err) {
          console.warn(
            "Summary refresh after upload failed",
            err instanceof Error ? err.message : String(err),
          );
          message.warning(
            err instanceof Error ? err.message : "Documents uploaded, but summary refresh failed.",
          );
        } finally {
          setGeneratingSummary(false);
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : t("uploadFailed"));
      } finally {
        setUploading(false);
        setUploadingFileName(null);
        setUploadingTotal(0);
      }
    },
    [
      currentOrgId,
      firstGeneralSpace,
      message,
      refetchDocs,
      refreshSummaryBothLocales,
      t,
    ],
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
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        locale,
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
                    : error && error.length > 0
                      ? error
                      : "Something went wrong. Please try again.",
              };
            }
            return next;
          });
        },
      },
    );
  }, [askRagStreaming, currentOrgId, documentNameMap, locale, messages, question, ragLoading]);

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
        minHeight: "100%",
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
                  className="knowledge-add-sources-btn"
                  icon={<PlusOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  loading={uploading}
                  block
                  style={{
                    marginBottom: "var(--space-2)",
                    overflow: "hidden",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {uploading && uploadingTotal > 0
                      ? `${t("indexingDocument")} (${uploadingFileIndex}/${uploadingTotal})`
                      : uploading
                        ? t("indexingDocument")
                        : t("addSources")}
                  </span>
                </Button>
                {uploading && uploadingTotal > 0 && uploadingFileName && (
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "var(--space-2)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={uploadingFileName}
                  >
                    {uploadingFileIndex}/{uploadingTotal} — {uploadingFileName}
                  </p>
                )}
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
                justifyContent: "flex-start",
                minHeight: 0,
                padding: 0,
                overflow: "hidden",
              }}
            >
              {/* Knowledge overview (title + summary) */}
              <KnowledgeOverview
                title={overviewTitle}
                summary={overviewSummary}
                generating={generatingSummary}
              />

              {/* Scrollable messages area */}
              <div
                className="chat-scroll-area"
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

              {/* Input area: single message box with button inside — pinned to bottom */}
              <div
                style={{
                  flexShrink: 0,
                  marginTop: "auto",
                  borderTop: "1px solid var(--color-border)",
                  padding: "var(--space-4)",
                  background: "var(--color-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
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
                  <Tooltip
                    title={t("contextUsageTooltip", {
                      percent: contextPercent.toFixed(1),
                      used: contextUsedTokens.toLocaleString(),
                      max: CONTEXT_WINDOW_MAX_TOKENS.toLocaleString(),
                    })}
                    placement="top"
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: "var(--radius-full)",
                        background: `conic-gradient(var(--color-primary) 0% ${contextPercent}%, var(--color-border) ${contextPercent}% 100%)`,
                        padding: 2,
                        cursor: "default",
                      }}
                      aria-hidden
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "var(--radius-full)",
                          background: "var(--color-input-bg)",
                        }}
                      />
                    </div>
                  </Tooltip>
                  {ragLoading ? (
                    <Button
                      icon={
                        <span
                          role="img"
                          aria-label={t("stop")}
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            backgroundColor: "currentColor",
                            borderRadius: 1,
                          }}
                        />
                      }
                      onClick={() => abortControllerRef.current?.abort()}
                      title={t("stop")}
                      className="knowledge-chat-stop-btn"
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        minWidth: 28,
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
                      className="knowledge-chat-send-btn"
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        minWidth: 28,
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
