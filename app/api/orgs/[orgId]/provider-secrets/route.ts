import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { encryptSecret } from "@/lib/llm/secrets";

type Params = { params: Promise<{ orgId: string }> };

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

type ProviderSecretRow = {
  provider: string;
  api_key_last4: string | null;
};

type ProviderSecretMetadata = {
  provider: SupportedProvider;
  hasKey: boolean;
  last4: string | null;
  updatedAt: string | null;
};

function normalizeProvider(value: string | undefined): SupportedProvider | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  return (SUPPORTED_PROVIDERS.find((p) => p === lower) as SupportedProvider | undefined) ?? null;
}

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("org_provider_secrets")
    .select("provider, api_key_last4, updated_at")
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as (ProviderSecretRow & { updated_at: string | null })[];

  const meta: ProviderSecretMetadata[] = SUPPORTED_PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider) ?? null;
    return {
      provider,
      hasKey: !!row,
      last4: row?.api_key_last4 ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return NextResponse.json({ secrets: meta });
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  const canManage = await hasPermission(orgId, user.id, "ORG_MANAGE_MEMBERS");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        provider?: string;
        apiKey?: string;
      }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = normalizeProvider(body.provider);
  const apiKey = body.apiKey?.trim() ?? "";

  if (!provider) {
    return NextResponse.json(
      { error: "provider must be one of openai, anthropic, or google" },
      { status: 400 },
    );
  }

  if (!apiKey) {
    return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(apiKey);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to encrypt API key; check server configuration",
      },
      { status: 500 },
    );
  }

  const last4 = apiKey.slice(-4);

  const { error } = await supabase.from("org_provider_secrets").upsert(
    {
      org_id: orgId,
      provider,
      encrypted_api_key: encrypted,
      api_key_last4: last4 || null,
    },
    { onConflict: "org_id,provider" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const meta: ProviderSecretMetadata = {
    provider,
    hasKey: true,
    last4: last4 || null,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json({ secret: meta });
}

