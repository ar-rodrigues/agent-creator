const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

type OllamaModelsResponse =
  | { models?: { name?: string; model?: string }[] }
  | { data?: { id?: string; name?: string }[] };

export async function listOllamaModels(): Promise<{ name: string }[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/v1/models`, {
      method: "GET",
    });

    if (!res.ok) {
      // Fallback to legacy tags endpoint if /v1/models is not available.
      return await listOllamaModelsFromTags();
    }

    const json = (await res.json()) as OllamaModelsResponse;

    const fromData =
      "data" in json && Array.isArray(json.data)
        ? json.data
            .map((m) => m.id || m.name)
            .filter((name): name is string => typeof name === "string" && !!name)
        : [];

    const fromModels =
      "models" in json && Array.isArray(json.models)
        ? json.models
            .map((m) => m.name || m.model)
            .filter((name): name is string => typeof name === "string" && !!name)
        : [];

    const names = Array.from(new Set([...fromData, ...fromModels]));

    return names.map((name) => ({ name }));
  } catch {
    return await listOllamaModelsFromTags();
  }
}

async function listOllamaModelsFromTags(): Promise<{ name: string }[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
    });

    if (!res.ok) {
      return [];
    }

    const json = (await res.json()) as { models?: { name?: string }[] };
    const names =
      Array.isArray(json.models) && json.models.length > 0
        ? json.models
            .map((m) => m.name)
            .filter((name): name is string => typeof name === "string" && !!name)
        : [];

    return names.map((name) => ({ name }));
  } catch {
    return [];
  }
}

