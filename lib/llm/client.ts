import { ClaudeLlmClient } from "@/lib/llm/providers/claude";
import { GeminiLlmClient } from "@/lib/llm/providers/gemini";
import { OllamaLlmClient } from "@/lib/llm/providers/ollama";
import type { ILlmClient, LlmProvider } from "@/lib/llm/types";

let cachedClients: Partial<Record<LlmProvider, ILlmClient>> = {};

export function getLlmClient(provider?: LlmProvider): ILlmClient {
  const resolvedProvider: LlmProvider =
    provider ?? (process.env.LLM_PROVIDER as LlmProvider) ?? "local";

  if (!cachedClients[resolvedProvider]) {
    cachedClients[resolvedProvider] = createClient(resolvedProvider);
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return cachedClients[resolvedProvider]!;
}

function createClient(provider: LlmProvider): ILlmClient {
  switch (provider) {
    case "local":
      return new OllamaLlmClient();
    case "gemini":
      return new GeminiLlmClient();
    case "claude":
      return new ClaudeLlmClient();
    default: {
      const _exhaustiveCheck: never = provider;
      throw new Error(`Unsupported LLM provider: ${_exhaustiveCheck}`);
    }
  }
}

