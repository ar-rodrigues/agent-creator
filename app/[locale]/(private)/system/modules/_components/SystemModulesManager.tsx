"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Select, Switch, Table, Tag } from "antd";
import { useTranslations } from "next-intl";

type ModuleRow = {
  id: string;
  org_id: string;
  module_key: string;
  enabled: boolean;
  source: string;
  updated_at: string;
  updated_by: string | null;
  updated_reason: string | null;
};

type OrgOption = { id: string; name: string };

export function SystemModulesManager() {
  const t = useTranslations("systemAdmin");
  const { message } = App.useApp();

  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filterOrg, setFilterOrg] = useState<string | undefined>();
  const [filterModule, setFilterModule] = useState<string | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOrg) params.set("orgId", filterOrg);
      if (filterModule) params.set("moduleKey", filterModule);

      const [modulesRes, orgsRes] = await Promise.all([
        fetch(`/api/system/modules?${params.toString()}`),
        fetch("/api/orgs"),
      ]);

      if (modulesRes.ok) {
        const payload = (await modulesRes.json()) as { modules: ModuleRow[] };
        setRows(payload.modules ?? []);
      }
      if (orgsRes.ok) {
        const payload = (await orgsRes.json()) as { organizations: OrgOption[] };
        setOrgs(payload.organizations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filterOrg, filterModule]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleToggle = useCallback(
    async (orgId: string, moduleKey: string, enabled: boolean) => {
      const key = `${orgId}-${moduleKey}`;
      setToggling(key);
      try {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/modules`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleKey, enabled, source: "manual" }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          void message.error(payload?.error ?? t("toggleFailed"));
          return;
        }
        void message.success(t("toggleSuccess"));
        setRows((prev) =>
          prev.map((r) =>
            r.org_id === orgId && r.module_key === moduleKey
              ? { ...r, enabled, updated_at: new Date().toISOString() }
              : r,
          ),
        );
      } finally {
        setToggling(null);
      }
    },
    [message, t],
  );

  const moduleKeys = [...new Set(rows.map((r) => r.module_key))].sort();

  const columns = [
    {
      title: t("organization"),
      dataIndex: "org_id",
      key: "org_id",
      render: (id: string) => orgs.find((o) => o.id === id)?.name ?? id,
    },
    {
      title: t("moduleKey"),
      dataIndex: "module_key",
      key: "module_key",
      render: (key: string) => <Tag>{key}</Tag>,
    },
    {
      title: t("enabled"),
      key: "enabled",
      render: (_: unknown, row: ModuleRow) => (
        <Switch
          checked={row.enabled}
          loading={toggling === `${row.org_id}-${row.module_key}`}
          onChange={(checked) => void handleToggle(row.org_id, row.module_key, checked)}
        />
      ),
    },
    {
      title: t("source"),
      dataIndex: "source",
      key: "source",
    },
    {
      title: t("updatedAt"),
      dataIndex: "updated_at",
      key: "updated_at",
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <Select
          allowClear
          placeholder={t("allOrgs")}
          style={{ minWidth: 220 }}
          options={orgs.map((o) => ({ value: o.id, label: o.name }))}
          onChange={(v: string | undefined) => setFilterOrg(v)}
        />
        <Select
          allowClear
          placeholder={t("allModules")}
          style={{ minWidth: 180 }}
          options={moduleKeys.map((k) => ({ value: k, label: k }))}
          onChange={(v: string | undefined) => setFilterModule(v)}
        />
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: t("noModules") }}
        size="small"
      />
    </div>
  );
}
