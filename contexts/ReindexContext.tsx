"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useCurrentOrganization } from "@/hooks/useCurrentOrganization";

export type ReindexState = {
  isReindexing: boolean;
  total: number;
  done: number;
};

const ReindexContext = createContext<ReindexState>({
  isReindexing: false,
  total: 0,
  done: 0,
});

export function useReindex(): ReindexState {
  return useContext(ReindexContext);
}

export function ReindexProvider({ children }: { children: React.ReactNode }) {
  const { currentOrgId } = useCurrentOrganization();
  const [state, setState] = useState<ReindexState>({ isReindexing: false, total: 0, done: 0 });
  // Each org switch gets a new generation number; the loop checks it before each step.
  const generationRef = useRef(0);

  const runReindex = useCallback(async (orgId: string, generation: number) => {
    try {
      const pendingRes = await fetch(`/api/orgs/${orgId}/reindex-pending`);
      if (!pendingRes.ok || generationRef.current !== generation) return;

      const { documentIds, total } = (await pendingRes.json()) as {
        documentIds: string[];
        total: number;
      };

      if (total === 0) {
        await fetch(`/api/orgs/${orgId}/reindex-complete`, { method: "POST" });
        return;
      }

      setState({ isReindexing: true, total, done: 0 });

      for (let i = 0; i < documentIds.length; i++) {
        if (generationRef.current !== generation) break;
        await fetch(`/api/documents/${documentIds[i]}/reembed`, { method: "POST" });
        if (generationRef.current === generation) {
          setState((prev) => ({ ...prev, done: i + 1 }));
        }
      }

      if (generationRef.current === generation) {
        await fetch(`/api/orgs/${orgId}/reindex-complete`, { method: "POST" });
      }
    } finally {
      if (generationRef.current === generation) {
        setState({ isReindexing: false, total: 0, done: 0 });
      }
    }
  }, []);

  useEffect(() => {
    if (!currentOrgId) return;

    const generation = ++generationRef.current;
    setState({ isReindexing: false, total: 0, done: 0 });

    void (async () => {
      const res = await fetch(`/api/orgs/${currentOrgId}/model-config`);
      if (!res.ok || generationRef.current !== generation) return;

      const payload = (await res.json()) as {
        config?: { reindexStatus?: string };
      };

      if (payload.config?.reindexStatus === "in_progress") {
        void runReindex(currentOrgId, generation);
      }
    })();
  }, [currentOrgId, runReindex]);

  return <ReindexContext.Provider value={state}>{children}</ReindexContext.Provider>;
}
