"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Table } from "antd";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { useOrgMembers } from "@/hooks/useOrgMembers";
import type { OrgMember } from "@/hooks/useOrgMembers";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/layout/Container";
import { Stack } from "@/components/layout/Stack";

const SEAT_OPTIONS = [
  { label: "Admin", value: "ADMIN" },
  { label: "User", value: "USER" },
];

export default function OrgSettingsPage() {
  const { message } = App.useApp();
  const { currentOrgId, currentOrganization } = useCurrentOrganization();
  const { can } = usePermissions(currentOrgId);
  const { data: org, loading: orgLoading, error: orgError, update } = useOrgSettings(currentOrgId);
  const { data: members, loading: membersLoading, error: membersError, refetch: refetchMembers } = useOrgMembers(currentOrgId);

  const [nameForm] = Form.useForm();
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSeat, setInviteSeat] = useState("USER");
  const [inviting, setInviting] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  const canManage = can("ORG_MANAGE_MEMBERS");

  useEffect(() => {
    if (org?.name) nameForm.setFieldsValue({ name: org.name });
  }, [org?.name, nameForm]);

  const handleSaveName = useCallback(async () => {
    if (!currentOrgId) return;
    const name = nameForm.getFieldValue("name")?.trim();
    if (!name) return;
    setSavingName(true);
    try {
      await update({ name });
      message.success("Organization name updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingName(false);
    }
  }, [currentOrgId, update, message, nameForm]);

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
      message.success("Member added");
      setInviteModalOpen(false);
      setInviteEmail("");
      setInviteSeat("USER");
      refetchMembers();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }, [currentOrgId, inviteEmail, inviteSeat, message, refetchMembers]);

  const handleUpdateMember = useCallback(
    async (membershipId: string, role: string, seat_type_key: string) => {
      if (!currentOrgId) return;
      setUpdatingMemberId(membershipId);
      try {
        const res = await fetch(`/api/orgs/${currentOrgId}/members/${membershipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: role.toLowerCase(), seat_type_key }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Update failed");
        }
        message.success("Member updated");
        refetchMembers();
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Update failed");
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [currentOrgId, message, refetchMembers],
  );

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
        message.success("Member removed");
        refetchMembers();
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Remove failed");
      }
    },
    [currentOrgId, message, refetchMembers],
  );

  if (!currentOrganization) {
    return (
      <Container>
        <p>Select an organization to view settings.</p>
      </Container>
    );
  }

  const columns = [
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (email: string | null, row: OrgMember) => email ?? row.display_name ?? row.user_id.slice(0, 8) + "...",
    },
    {
      title: "Role",
      dataIndex: "role",
      key: "role",
      render: (role: string, row: OrgMember) =>
        canManage ? (
          <Select
            size="small"
            style={{ width: 100 }}
            value={role}
            loading={updatingMemberId === row.id}
            options={[
              { label: "Admin", value: "admin" },
              { label: "Member", value: "member" },
            ]}
            onChange={(v) => handleUpdateMember(row.id, v, v === "admin" ? "ADMIN" : "USER")}
          />
        ) : (
          role
        ),
    },
    {
      title: "Seat",
      dataIndex: "seat_type_name",
      key: "seat_type",
      render: (name: string | null, row: OrgMember) =>
        canManage ? (
          <Select
            size="small"
            style={{ width: 100 }}
            value={row.seat_type_key ?? "USER"}
            loading={updatingMemberId === row.id}
            options={SEAT_OPTIONS}
            onChange={(v) => handleUpdateMember(row.id, row.role, v)}
          />
        ) : (
          name ?? "User"
        ),
    },
    ...(canManage
      ? [
          {
            title: "",
            key: "actions",
            render: (_: unknown, row: OrgMember) => (
              <Popconfirm
                title="Remove this member?"
                onConfirm={() => handleRemoveMember(row.id)}
              >
                <Button type="link" danger size="small">
                  Remove
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ];

  return (
    <Container>
      <Stack gap="lg">
        <h1>Organization settings</h1>
        {(orgError || membersError) && (
          <p style={{ color: "var(--color-error)" }}>{orgError ?? membersError}</p>
        )}

        <Card>
          <Stack gap="md">
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Details</h2>
            {orgLoading ? (
              <p>Loading…</p>
            ) : org ? (
              <Form form={nameForm} layout="vertical" initialValues={{ name: org.name }}>
                <Form.Item label="Organization name" name="name">
                  <Input
                    disabled={!canManage}
                    onBlur={() => canManage && void handleSaveName()}
                    onPressEnter={() => canManage && void handleSaveName()}
                  />
                </Form.Item>
                {canManage && (
                  <Button type="primary" loading={savingName} onClick={() => void handleSaveName()}>
                    Save name
                  </Button>
                )}
              </Form>
            ) : null}
            {org && (
              <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
                Created {new Date(org.created_at).toLocaleDateString()}
              </p>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Members</h2>
              {canManage && (
                <Button type="primary" onClick={() => setInviteModalOpen(true)}>
                  Invite member
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
        title="Invite member"
        open={inviteModalOpen}
        onOk={() => void handleInvite()}
        onCancel={() => setInviteModalOpen(false)}
        confirmLoading={inviting}
        okButtonProps={{ disabled: !inviteEmail.trim() }}
      >
        <Stack gap="md">
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Email</label>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Seat type</label>
            <Select
              style={{ width: "100%" }}
              value={inviteSeat}
              onChange={setInviteSeat}
              options={SEAT_OPTIONS}
            />
          </div>
        </Stack>
      </Modal>
    </Container>
  );
}
