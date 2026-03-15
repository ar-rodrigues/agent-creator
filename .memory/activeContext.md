## Active Context – Agent & Skill Creator

### Current Task

**Phase 1 – Knowledge & org settings are implemented.** Recent work (see last 10+ commits) added: Knowledge page (streaming QA chat, context token usage, localized summaries, reindex status); Org settings (embedding dimension config, reindex flow, provider secrets, model config); embeddings concurrency/retry; layout i18n. **Next focus:** Extend RAG retrieval to full similarity search; optionally add a documents/knowledge space detail view for indexing status. Skills layer (Phase 2) and agents/crews (Phase 3) follow.

### Focus / Notes

- **Knowledge page** (`app/[locale]/(private)/dashboard/knowledge/`): Main page + `_components/ChatMessage.tsx`, `KnowledgeOverview.tsx`, `SourceBadge.tsx`. Uses `useRagGeneral` (ask + askStreaming), `useKnowledgeSpaces`, `useGeneralDocuments`; token estimation via `lib/utils/tokens.ts` (`estimateTokens`, `CONTEXT_WINDOW_MAX_TOKENS`). Summary refresh: `POST /api/knowledge-spaces/[spaceId]/summary` with concurrency guard per space/locale.
- **Org settings** (`app/[locale]/(private)/org/settings/page.tsx`): Model config (chat + embedding), embedding dimension selector when model supports it, provider secrets (OpenAI/Anthropic/Google), reindex status. Hooks: `useOrgModelConfig`, `useOrgProviderSecrets`, `useReindex` from `ReindexContext`.
- **Reindex flow**: `contexts/ReindexContext.tsx`; APIs: `reindex-pending`, `documents/[id]/reembed`, `reindex-complete`; `reindex-finished` event refreshes model config.
- **Memory Bank:** projectBrief, productContext, progressState, and this file are up to date with knowledge + org settings as of 2025-03-15. Update progressState when shipping features; update activeContext when shifting focus; keep productContext/projectBrief aligned with product/architecture decisions.

## Active Context – Agent Creator

### Current Task

Align the project Memory Bank (`.memory/` folder) with the **knowledge & storage Phase 1 focus** (chunking, embeddings, org‑level model config, and versioned RAG retrieval) so that future work can reliably use and update:

- `projectBrief.md`
- `productContext.md`
- `progressState.md`
- `activeContext.md`

The goal is to have accurate, living documentation of project goals, product behavior, current state, and the active focus.

### Focus / Notes

- Derived content from the current codebase only (Next.js 16, Supabase auth, `next-intl`, Ant Design, centralized styling), without assuming unimplemented features.
- Left explicit **TODO** markers in the brief and product context for:
  - Refining goals and target users.
  - Defining concrete “agent” and “skill” features.
  - Populating upcoming work items in `progressState.md`.
- Future tasks should:
  - Update `progressState.md` when major features or flows are added/changed (knowledge pipeline, skills registry, agent/crew features).
  - Update this `activeContext.md` when switching focus to a new task or area (e.g. skills layer, agents & crews, org management UI).
  - Adjust `projectBrief.md` or `productContext.md` only when goals, constraints, or product behavior materially change.

