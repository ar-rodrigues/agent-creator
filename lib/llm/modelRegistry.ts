import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listOllamaModels } from "@/lib/llm/localModels";

export type RegisteredEmbeddingModel = {
  provider: string;
  name: string;
  dimension: number;
  dimensionConfigurable: boolean;
  allowedDimensions?: number[];
  isLocal: boolean;
  isEnabled: boolean;
  isAvailable: boolean;
  bestFor?: string | null;
};

export type RegisteredChatModel = {
  provider: string;
  name: string;
  isLocal: boolean;
  isEnabled: boolean;
};

export async function getAvailableEmbeddingModels(): Promise<RegisteredEmbeddingModel[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("embedding_models")
    .select("provider, name, kind, dimension, dimension_configurable, allowed_dimensions, best_for, is_local, is_enabled")
    .eq("kind", "embedding");

  if (error || !data) {
    console.warn("Failed to load embedding_models registry", error?.message);
    return [];
  }

  const localOllamaModels = await listOllamaModels();
  const localOllamaNames = new Set(localOllamaModels.map((m) => m.name));

  const matchesOllamaName = (registryName: string) => {
    const withoutLatest = registryName.replace(/:latest$/, "");
    return (
      localOllamaNames.has(registryName) ||
      localOllamaNames.has(withoutLatest) ||
      (!registryName.endsWith(":latest") &&
        localOllamaNames.has(registryName + ":latest"))
    );
  };

  return data.map((row) => {
    const isLocal = !!row.is_local;
    const isEnabled = !!row.is_enabled;
    const allowedDimensions = Array.isArray(row.allowed_dimensions)
      ? (row.allowed_dimensions as number[]).filter((n) => typeof n === "number")
      : undefined;
    const base: RegisteredEmbeddingModel = {
      provider: row.provider,
      name: row.name,
      dimension: row.dimension ?? 0,
      dimensionConfigurable: !!row.dimension_configurable,
      ...(allowedDimensions?.length ? { allowedDimensions } : {}),
      isLocal,
      isEnabled,
      isAvailable: isEnabled,
      bestFor: row.best_for ?? null,
    };

    if (isLocal && row.provider === "ollama") {
      const isAvailable = isEnabled && matchesOllamaName(row.name);

      return {
        ...base,
        isAvailable,
      };
    }

    return base;
  });
}

export async function getAvailableChatModels(): Promise<RegisteredChatModel[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("embedding_models")
    .select("provider, name, kind, is_local, is_enabled")
    .eq("kind", "chat");

  if (error || !data) {
    console.warn("Failed to load chat models from embedding_models", error?.message);
    return [];
  }

  const localOllamaModels = await listOllamaModels();
  const localOllamaNames = new Set(localOllamaModels.map((m) => m.name));

  const matchesOllamaName = (registryName: string) => {
    const withoutLatest = registryName.replace(/:latest$/, "");
    return (
      localOllamaNames.has(registryName) ||
      localOllamaNames.has(withoutLatest) ||
      (!registryName.endsWith(":latest") &&
        localOllamaNames.has(registryName + ":latest"))
    );
  };

  return data
    .map((row) => ({
      provider: row.provider,
      name: row.name,
      isLocal: !!row.is_local,
      isEnabled: !!row.is_enabled,
    }))
    .filter((row) => {
      if (!row.isEnabled) return false;
      if (row.isLocal && row.provider === "ollama") {
        return matchesOllamaName(row.name);
      }
      return true;
    });
}

