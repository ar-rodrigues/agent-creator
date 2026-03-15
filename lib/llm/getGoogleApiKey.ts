import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/llm/secrets";

/**
 * Returns the Google (Gemini) API key for embedding/chat calls.
 * Prefers the org's stored secret (org_provider_secrets, provider 'google');
 * falls back to process.env.GEMINI_API_KEY.
 */
export async function getGoogleApiKey(orgId: string): Promise<string | null> {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_provider_secrets")
    .select("encrypted_api_key")
    .eq("org_id", orgId)
    .eq("provider", "google")
    .maybeSingle();

  if (error || !data?.encrypted_api_key) {
    return envKey ?? null;
  }

  try {
    const decrypted = decryptSecret(data.encrypted_api_key as string);
    return decrypted?.trim() || envKey || null;
  } catch {
    return envKey ?? null;
  }
}
