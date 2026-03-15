"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Table } from "antd";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { useOrgModelConfig } from "@/hooks/useOrgModelConfig";
import { useReindex } from "@/contexts/ReindexContext";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import type { OrgMember } from "@/hooks/useOrgMembers";
import { useOrgProviderSecrets } from "@/hooks/useOrgProviderSecrets";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";

const getSeatOptions = (t: (key: string) => string) => [
  { label: t("seatAdmin"), value: "ADMIN" },
  { label: t("seatUser"), value: "USER" },
];

export default function OrgSettingsPage() {
  const t = useTranslations("orgSettings");
  const { message } = App.useApp();
  const { currentOrgId, currentOrganization } = useCurrentOrganization();
  const { can } = usePermissions(currentOrgId);
  const { data: org, loading: orgLoading, error: orgError, update } = useOrgSettings(currentOrgId);
  const { data: members, loading: membersLoading, error: membersError, refetch: refetchMembers } = useOrgMembers(currentOrgId);
  const {
    data: modelConfig,
    loading: modelLoading,
    error: modelError,
    refetch: refetchModelConfig,
    update: updateModelConfig,
  } = useOrgModelConfig(currentOrgId);
  const { isReindexing, total: reindexTotal, done: reindexDone } = useReindex();

  // Refetch model config when reindex finishes so reindexStatus updates from 'in_progress' to 'idle'
  useEffect(() => {
    if (!currentOrgId) return;
    const handler = (e: CustomEvent<{ orgId: string }>) => {
      if (e.detail?.orgId === currentOrgId) void refetchModelConfig();
    };
    window.addEventListener("reindex-finished", handler as EventListener);
    return () => window.removeEventListener("reindex-finished", handler as EventListener);
  }, [currentOrgId, refetchModelConfig]);
  const {
    data: providerSecrets,
    loading: providerSecretsLoading,
    error: providerSecretsError,
    update: updateProviderSecret,
  } = useOrgProviderSecrets(currentOrgId);

  const [nameForm] = Form.useForm();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSeat, setInviteSeat] = useState("USER");
  const [inviting, setInviting] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [savingModelConfig, setSavingModelConfig] = useState(false);
  const [savingProvider, setSavingProvider] = useState<null | "openai" | "anthropic" | "google">(null);
  const [chatProvider, setChatProvider] = useState("local");
  const [chatModel, setChatModel] = useState("");
  const [embeddingProvider, setEmbeddingProvider] = useState("local");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [chatProviderFilter, setChatProviderFilter] = useState<string | "all">("all");
  const [embeddingProviderFilter, setEmbeddingProviderFilter] = useState<
    string | "all"
  >("all");
  const [availableChatModels, setAvailableChatModels] = useState<
    { provider: string; name: string; isLocal: boolean }[]
  >([]);
  const [availableEmbeddingModels, setAvailableEmbeddingModels] = useState<
    {
      provider: string;
      name: string;
      dimension: number;
      dimensionConfigurable: boolean;
      allowedDimensions?: number[];
      isLocal: boolean;
      isAvailable: boolean;
      bestFor?: string | null;
    }[]
  >([]);
  const [embeddingDimensionSelection, setEmbeddingDimensionSelection] = useState<
    number | null
  >(null);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [googleKeyInput, setGoogleKeyInput] = useState("");
  const [editingProvider, setEditingProvider] = useState<null | "openai" | "anthropic" | "google">(null);

  const canManage = can("ORG_MANAGE_MEMBERS");

  useEffect(() => {
    if (org?.name) nameForm.setFieldsValue({ name: org.name });
  }, [org?.name, nameForm]);

  useEffect(() => {
    if (!modelConfig) return;
    setChatProvider(modelConfig.chatProvider || "local");
    setChatModel(modelConfig.chatModel ?? "");
    setEmbeddingProvider(modelConfig.embeddingProvider || "local");
    setEmbeddingModel(modelConfig.embeddingModel || "");
    const dim =
      modelConfig.embeddingDimension ?? modelConfig.embeddingDimensionDefault;
    setEmbeddingDimensionSelection(dim > 0 ? dim : null);
  }, [modelConfig]);

  useEffect(() => {
    if (!modelConfig) return;

    if (modelConfig.chatModel && availableChatModels.length > 0) {
      const matchedChat = availableChatModels.find(
        (m) => m.name === modelConfig.chatModel,
      );
      if (matchedChat) {
        setChatProvider(matchedChat.provider);
        setChatProviderFilter(matchedChat.provider);
      }
    }

    if (modelConfig.embeddingModel && availableEmbeddingModels.length > 0) {
      const matchedEmbedding = availableEmbeddingModels.find(
        (m) => m.name === modelConfig.embeddingModel,
      );
      if (matchedEmbedding) {
        setEmbeddingProvider(matchedEmbedding.provider);
        setEmbeddingProviderFilter(matchedEmbedding.provider);
      }
    }
  }, [availableChatModels, availableEmbeddingModels, modelConfig]);

  useEffect(() => {
    if (!currentOrgId || !canManage) return;

    let cancelled = false;

    const loadModels = async () => {
      try {
        const res = await fetch(`/api/orgs/${currentOrgId}/models`);
        if (!res.ok) return;
        const payload = (await res.json().catch(() => null)) as
          | {
              embeddingModels?: {
                provider: string;
                name: string;
                dimension: number;
                dimensionConfigurable?: boolean;
                allowedDimensions?: number[];
                isLocal: boolean;
                isAvailable: boolean;
                bestFor?: string | null;
              }[];
              chatModels?: {
                provider: string;
                name: string;
                isLocal: boolean;
              }[];
            }
          | null;
        if (!payload || cancelled) return;
        setAvailableEmbeddingModels(
          (payload.embeddingModels ?? []).map((m) => ({
            ...m,
            dimensionConfigurable: m.dimensionConfigurable ?? false,
          })),
        );
        setAvailableChatModels(payload.chatModels ?? []);
      } catch {
        // Ignore model loading failures; UI will fall back to existing config values.
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [canManage, currentOrgId]);

  const handleSaveName = useCallback(async () => {
    if (!currentOrgId) return;
    const name = nameForm.getFieldValue("name")?.trim();
    if (!name) return;
    setSavingName(true);
    try {
      await update({ name });
      message.success(t("nameUpdated"));
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("updateFailed"));
    } finally {
      setSavingName(false);
    }
  }, [currentOrgId, update, message, nameForm, t]);

  const handleInvite = useCallback(async () => {
    if (!currentOrgId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/orgs/${currentOrgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), seat_type_key: inviteSeat }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Invite failed");
      }
      message.success(t("memberAdded"));
      setInviteModalOpen(false);
      setInviteEmail("");
      setInviteSeat("USER");
      refetchMembers();
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("inviteFailed"));
    } finally {
      setInviting(false);
    }
  }, [currentOrgId, inviteEmail, inviteSeat, message, refetchMembers, t]);

  const handleUpdateMemberSeat = useCallback(
    async (membershipId: string, seat_type_key: string) => {
      if (!currentOrgId) return;
      setUpdatingMemberId(membershipId);
      try {
        const res = await fetch(`/api/orgs/${currentOrgId}/members/${membershipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seat_type_key }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Update failed");
        }
        message.success(t("memberUpdated"));
        refetchMembers();
      } catch (err) {
        message.error(err instanceof Error ? err.message : t("updateFailed"));
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [currentOrgId, message, refetchMembers, t],
  );

  const handleSaveProviderKey = useCallback(
    async (provider: "openai" | "anthropic" | "google", apiKey: string) => {
      if (!currentOrgId || !apiKey.trim()) return;
      setSavingProvider(provider);
      try {
        await updateProviderSecret(provider, apiKey.trim());
        message.success(t("providerKeySaved"));
        setEditingProvider(null);
        if (provider === "openai") setOpenaiKeyInput("");
        if (provider === "anthropic") setAnthropicKeyInput("");
        if (provider === "google") setGoogleKeyInput("");
      } catch (err) {
        message.error(
          err instanceof Error ? err.message : t("providerKeySaveFailed"),
        );
      } finally {
        setSavingProvider(null);
      }
    },
    [
      currentOrgId,
      message,
      t,
      updateProviderSecret,
    ],
  );

  const handleSaveModelConfig = useCallback(async () => {
    if (!currentOrgId) return;
    if (!chatProvider.trim() || !embeddingProvider.trim() || !embeddingModel.trim()) {
      return;
    }
    setSavingModelConfig(true);
    try {
      const defaultDim = modelConfig?.embeddingDimensionDefault ?? 0;
      const effectiveSelection =
        embeddingDimensionSelection ?? defaultDim;
      const embeddingDimension =
        modelConfig?.embeddingDimensionConfigurable
          ? effectiveSelection === defaultDim
            ? null
            : effectiveSelection
          : undefined;
      const updated = await updateModelConfig({
        chatProvider: chatProvider.trim(),
        chatModel: chatModel.trim() ? chatModel.trim() : null,
        embeddingProvider: embeddingProvider.trim(),
        embeddingModel: embeddingModel.trim(),
        ...(modelConfig?.embeddingDimensionConfigurable
          ? { embeddingDimension }
          : {}),
      });
      message.success(t("modelConfigUpdated"));
      if (updated?.reindexStatus === "in_progress") {
        // #region agent log
        fetch("http://127.0.0.1:7607/ingest/e112d8ee-afe5-4f41-b25a-54d819e96ee7", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "028a22" },
          body: JSON.stringify({
            sessionId: "028a22",
            location: "settings/page.tsx:handleSaveModelConfig",
            message: "dispatching reindex-requested after save",
            data: { orgId: currentOrgId, reindexStatus: updated.reindexStatus },
            timestamp: Date.now(),
            hypothesisId: "A",
          }),
        }).catch(() => {});
        // #endregion
        window.dispatchEvent(
          new CustomEvent("reindex-requested", { detail: { orgId: currentOrgId } }),
        );
      }
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : t("modelConfigUpdateFailed"),
      );
    } finally {
      setSavingModelConfig(false);
    }
  }, [
    chatModel,
    chatProvider,
    currentOrgId,
    embeddingDimensionSelection,
    embeddingModel,
    embeddingProvider,
    message,
    modelConfig?.embeddingDimensionConfigurable,
    t,
    updateModelConfig,
  ]);

  const filteredChatOptions = useMemo(() => {
    const base = availableChatModels.filter((m) =>
      chatProviderFilter === "all" ? true : m.provider === chatProviderFilter,
    );
    return base.map((m) => ({
      label: `${m.name} (${m.provider})`,
      value: m.name,
    }));
  }, [availableChatModels, chatProviderFilter]);

  const filteredEmbeddingOptions = useMemo(() => {
    const base = availableEmbeddingModels.filter((m) => {
      if (!m.isAvailable) return false;
      if (embeddingProviderFilter === "all") return true;
      return m.provider === embeddingProviderFilter;
    });

    return base.map((m) => ({
      label: m.bestFor
        ? `${m.name} (${m.provider}, ${m.dimension}D) — ${m.bestFor}`
        : `${m.name} (${m.provider}, ${m.dimension}D)`,
      value: m.name,
    }));
  }, [availableEmbeddingModels, embeddingProviderFilter]);

  const chatProviderFilterOptions = useMemo(() => {
    const providers = Array.from(new Set(availableChatModels.map((m) => m.provider)));
    return [
      { label: t("chatProviderAll"), value: "all" as const },
      ...providers.map((p) => ({ label: p, value: p })),
    ];
  }, [availableChatModels, t]);

  const embeddingProviderFilterOptions = useMemo(() => {
    const providers = Array.from(
      new Set(availableEmbeddingModels.map((m) => m.provider)),
    );
    return [
      { label: t("embeddingProviderAll"), value: "all" as const },
      ...providers.map((p) => ({ label: p, value: p })),
    ];
  }, [availableEmbeddingModels, t]);

  const CLOUD_PROVIDERS = ["openai", "anthropic", "google"] as const;
  const providerToKeyProvider: Record<string, (typeof CLOUD_PROVIDERS)[number]> = {
    google: "google",
    gemini: "google",
    openai: "openai",
    anthropic: "anthropic",
  };
  const relevantCloudProviders = useMemo(() => {
    const set = new Set<(typeof CLOUD_PROVIDERS)[number]>();
    const chatKey = chatProvider ? providerToKeyProvider[chatProvider.toLowerCase()] : undefined;
    const embedKey = embeddingProvider ? providerToKeyProvider[embeddingProvider.toLowerCase()] : undefined;
    if (chatKey) set.add(chatKey);
    if (embedKey) set.add(embedKey);
    return Array.from(set);
  }, [chatProvider, embeddingProvider]);

  useEffect(() => {
    if (!chatModel || filteredChatOptions.length === 0) return;
    const exists = filteredChatOptions.some((opt) => opt.value === chatModel);
    if (!exists) {
      setChatModel("");
    }
  }, [chatModel, filteredChatOptions]);

  useEffect(() => {
    if (!embeddingModel || filteredEmbeddingOptions.length === 0) return;
    const exists = filteredEmbeddingOptions.some(
      (opt) => opt.value === embeddingModel,
    );
    if (!exists) {
      setEmbeddingModel("");
    }
  }, [embeddingModel, filteredEmbeddingOptions]);

  const handleRemoveMember = useCallback(
    async (membershipId: string) => {
      if (!currentOrgId) return;
      try {
        const res = await fetch(`/api/orgs/${currentOrgId}/members/${membershipId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Remove failed");
        }
        message.success(t("memberRemoved"));
        refetchMembers();
      } catch (err) {
        message.error(err instanceof Error ? err.message : t("removeFailed"));
      }
    },
    [currentOrgId, message, refetchMembers, t],
  );

  if (!currentOrganization) {
    return (
      <Container size="xl">
        <p>{t("selectOrg")}</p>
      </Container>
    );
  }

  const columns = [
    {
      title: t("email"),
      dataIndex: "email",
      key: "email",
      render: (email: string | null, row: OrgMember) => email ?? row.display_name ?? row.user_id.slice(0, 8) + "...",
    },
    {
      title: t("seat"),
      dataIndex: "seat_type_name",
      key: "seat_type",
      render: (name: string | null, row: OrgMember) =>
        canManage ? (
          <Select
            size="small"
            style={{ width: 100 }}
            value={row.seat_type_key ?? "USER"}
            loading={updatingMemberId === row.id}
            options={getSeatOptions(t)}
            onChange={(v) => handleUpdateMemberSeat(row.id, v)}
          />
        ) : (
          name ?? t("seatUser")
        ),
    },
    ...(canManage
      ? [
          {
            title: "",
            key: "actions",
            render: (_: unknown, row: OrgMember) => (
              <Popconfirm
                title={t("removeConfirm")}
                onConfirm={() => handleRemoveMember(row.id)}
              >
                <Button type="link" danger size="small">
                  {t("remove")}
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <Container size="xl">
      <Stack gap="lg">
        <h1>{t("title")}</h1>
        {(orgError || membersError || modelError || providerSecretsError) && (
          <p style={{ color: "var(--color-error)" }}>
            {orgError ?? membersError ?? modelError ?? providerSecretsError}
          </p>
        )}

        <Card>
          <Stack gap="md">
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{t("details")}</h2>
            {orgLoading ? (
              <p>{t("loading")}</p>
            ) : org ? (
              <Form form={nameForm} layout="vertical" initialValues={{ name: org.name }}>
                <Form.Item label={t("orgName")} name="name">
                  <Input
                    disabled={!canManage}
                    onBlur={() => canManage && void handleSaveName()}
                    onPressEnter={() => canManage && void handleSaveName()}
                  />
                </Form.Item>
                {canManage && (
                  <Button type="primary" loading={savingName} onClick={() => void handleSaveName()}>
                    {t("saveName")}
                  </Button>
                )}
              </Form>
            ) : null}
            {org && (
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 14 }}>
                {t("created")} {new Date(org.created_at).toLocaleDateString()}
              </p>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              {t("modelsSectionTitle")}
            </h2>
            {modelLoading && <p>{t("loading")}</p>}
            {modelConfig && (
              <Stack gap="md">
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: "0 0 200px", minWidth: 160 }}>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        {t("chatProvider")}
                      </label>
                      <Select
                        style={{ width: "100%" }}
                        value={chatProviderFilter}
                        disabled={!canManage}
                        onChange={(value: string | "all") => setChatProviderFilter(value)}
                        options={chatProviderFilterOptions}
                      />
                    </div>
                    <div style={{ flex: "1 1 auto", minWidth: 200 }}>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        {t("chatModel")}
                      </label>
                      <Select
                        showSearch
                        style={{ width: "100%" }}
                        value={chatModel || undefined}
                        disabled={!canManage}
                        placeholder={t("chatModelPlaceholder")}
                        onChange={(value) => {
                          setChatModel(value);
                          const matched = availableChatModels.find(
                            (m) => m.name === value,
                          );
                          if (matched) {
                            setChatProvider(matched.provider);
                          }
                        }}
                        options={filteredChatOptions}
                        optionFilterProp="label"
                        allowClear
                      />
                    </div>
                  </div>
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--color-text-muted)" }}>
                    {t("chatModelHelp")}
                  </p>
                </div>
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: "0 0 200px", minWidth: 160 }}>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        {t("embeddingProvider")}
                      </label>
                      <Select
                        style={{ width: "100%" }}
                        value={embeddingProviderFilter}
                        disabled={!canManage}
                        onChange={(value: string | "all") =>
                          setEmbeddingProviderFilter(value)
                        }
                        options={embeddingProviderFilterOptions}
                      />
                    </div>
                    <div style={{ flex: "1 1 auto", minWidth: 200 }}>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        {t("embeddingModel")}
                      </label>
                      <Select
                        showSearch
                        style={{ width: "100%" }}
                        value={embeddingModel || undefined}
                        disabled={!canManage}
                        placeholder={t("embeddingModelPlaceholder")}
                        onChange={(value) => {
                          setEmbeddingModel(value);
                          const matched = availableEmbeddingModels.find(
                            (m) => m.name === value,
                          );
                          if (matched) {
                            setEmbeddingProvider(matched.provider);
                          }
                        }}
                        options={filteredEmbeddingOptions}
                        optionFilterProp="label"
                      />
                    </div>
                  </div>
                  {filteredEmbeddingOptions.length === 0 && (
                    <p style={{ marginTop: 8, fontSize: 14, color: "var(--color-text-muted)" }}>
                      {t("noModelsForMode")}
                    </p>
                  )}
                  <p style={{ marginTop: 8, fontSize: 14, color: "var(--color-text-muted)" }}>
                    {t("embeddingModelHelp")}
                  </p>
                </div>
                {embeddingModel && (
                  <div>
                    <label style={{ display: "block", marginBottom: 4 }}>
                      {t("embeddingDimension")}
                    </label>
                    {modelConfig.embeddingDimensionConfigurable ? (
                      <>
                        <Select
                          style={{ width: 160 }}
                          value={
                            (embeddingDimensionSelection ??
                              modelConfig.embeddingDimensionDefault) ||
                            null
                          }
                          disabled={!canManage}
                          onChange={(v) =>
                            setEmbeddingDimensionSelection(
                              v != null ? (v as number) : null,
                            )
                          }
                          options={[
                            ...new Set([
                              ...(modelConfig.embeddingDimensionAllowed?.length
                                ? modelConfig.embeddingDimensionAllowed
                                : [256, 384, 512, 768, 1024, 1536, 2048, 3072]),
                              modelConfig.embeddingDimensionDefault,
                            ].filter((d) => typeof d === "number" && d > 0)),
                          ]
                            .sort((a, b) => a - b)
                            .map((d) => ({ label: `${d}`, value: d }))}
                        />
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 14,
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {t("embeddingDimensionHelp")}
                        </p>
                      </>
                    ) : (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {t("embeddingDimensionFixed", {
                          dimension: modelConfig.embeddingDimensionDefault,
                        })}
                      </p>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
                  <p style={{ margin: 0 }}>
                    {t("embeddingVersion", {
                      version: modelConfig.currentEmbeddingVersion,
                    })}
                  </p>
                  {modelConfig.previousEmbeddingVersion !== null && (
                    <p style={{ margin: 0 }}>
                      {t("embeddingPreviousVersion", {
                        version: modelConfig.previousEmbeddingVersion,
                      })}
                      {modelConfig.reindexStatus === "idle" && (
                        <span style={{ marginLeft: 6, color: "var(--color-text-muted)" }}>
                          — {t("embeddingPreviousVersionFallback")}
                        </span>
                      )}
                    </p>
                  )}
                  {modelConfig.reindexStatus === "in_progress" && (
                    <p style={{ margin: "4px 0 0", color: "var(--color-primary)" }}>
                      {t("embeddingReindexInProgress")}
                      {isReindexing && reindexTotal > 0 && (
                        <span style={{ marginLeft: 8 }}>
                          ({reindexDone}/{reindexTotal})
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {relevantCloudProviders.length > 0 && (
                  <div
                    style={{
                      paddingTop: "var(--space-4)",
                      marginTop: "var(--space-4)",
                      borderTop: "1px solid var(--color-border)",
                    }}
                  >
                    <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "1rem", fontWeight: 600 }}>
                      {t("cloudKeysSectionTitle")}
                    </h3>
                    <p style={{ margin: "0 0 var(--space-3)", fontSize: 14, color: "var(--color-text-muted)" }}>
                      {t("cloudKeysHelp")}
                    </p>
                    {providerSecretsLoading && <p>{t("loading")}</p>}
                    {providerSecrets && (
                      <Stack gap="md">
                        {relevantCloudProviders.map((provider) => {
                          const secret = providerSecrets.find((s) => s.provider === provider) ?? null;
                          const hasKey = secret?.hasKey ?? false;
                          const last4 = secret?.last4 ?? null;
                          const labelKey =
                            provider === "openai"
                              ? "openaiLabel"
                              : provider === "anthropic"
                                ? "anthropicLabel"
                                : "googleLabel";
                          const inputValue =
                            provider === "openai"
                              ? openaiKeyInput
                              : provider === "anthropic"
                                ? anthropicKeyInput
                                : googleKeyInput;
                          const isEditing = editingProvider === provider || !hasKey;

                          return (
                            <div key={provider}>
                              <label style={{ display: "block", marginBottom: 4 }}>
                                {t(labelKey)}
                              </label>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                                  {isEditing ? (
                                    <Input.Password
                                      value={inputValue}
                                      disabled={!canManage}
                                      placeholder={t("apiKeyPlaceholder")}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (provider === "openai") setOpenaiKeyInput(value);
                                        if (provider === "anthropic") setAnthropicKeyInput(value);
                                        if (provider === "google") setGoogleKeyInput(value);
                                      }}
                                    />
                                  ) : (
                                    <Input.Password
                                      value="********"
                                      disabled
                                    />
                                  )}
                                </div>
                                {isEditing ? (
                                  <Button
                                    type="primary"
                                    onClick={() => void handleSaveProviderKey(provider, inputValue)}
                                    disabled={!canManage || !inputValue.trim()}
                                    loading={savingProvider === provider}
                                  >
                                    {t("saveApiKey")}
                                  </Button>
                                ) : (
                                  canManage && (
                                    <Button
                                      type="default"
                                      onClick={() => {
                                        setEditingProvider(provider);
                                        if (provider === "openai") setOpenaiKeyInput("");
                                        if (provider === "anthropic") setAnthropicKeyInput("");
                                        if (provider === "google") setGoogleKeyInput("");
                                      }}
                                    >
                                      {t("overwriteApiKey")}
                                    </Button>
                                  )
                                )}
                              </div>
                              <p style={{ marginTop: 4, fontSize: 14, color: "var(--color-text-muted)" }}>
                                {hasKey
                                  ? last4
                                    ? t("apiKeyConfiguredMasked", { last4 })
                                    : t("apiKeyConfigured")
                                  : t("apiKeyNotConfigured")}
                              </p>
                            </div>
                          );
                        })}
                      </Stack>
                    )}
                  </div>
                )}

                {canManage && (
                  <Button
                    type="primary"
                    loading={savingModelConfig}
                    onClick={() => void handleSaveModelConfig()}
                  >
                    {t("saveModelConfig")}
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{t("members")}</h2>
              {canManage && (
                <Button type="primary" onClick={() => setInviteModalOpen(true)}>
                  {t("inviteMember")}
                </Button>
              )}
            </div>
            <Table
              loading={membersLoading}
              dataSource={members ?? []}
              columns={columns}
              rowKey="id"
              pagination={false}
            />
          </Stack>
        </Card>
      </Stack>

      <Modal
        title={t("inviteModalTitle")}
        open={inviteModalOpen}
        onOk={() => void handleInvite()}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviting}
        okButtonProps={{ disabled: !inviteEmail.trim() }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>{t("email")}</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={t("emailPlaceholder")}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>{t("seatType")}</label>
            <Select
              style={{ width: "100%" }}
              value={inviteSeat}
              onChange={setInviteSeat}
              options={getSeatOptions(t)}
            />
          </div>
        </Stack>
      </Modal>
    </Container>
  );
}
