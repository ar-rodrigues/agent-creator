## Active Context – Agent & Skill Creator

### Current Task

**Phase 1 follow‑ups:** Implement the first end‑to‑end **document chunking and embeddings pipeline** for uploaded documents; extend RAG retrieval to full similarity search over embeddings (org + knowledge spaces + version-aware). Add a minimal **documents/knowledge space detail** view for indexing status. Org‑level model configuration, model registry, provider secrets, and General QA on the Knowledge page are already in place.

### Focus / Notes

- The Memory Bank now:
  - Describes the product as an **Agent & Skill Creator** with:
    - **Skills** (reusable tools).
    - **Agents** (skills + knowledge spaces + instructions).
    - **Knowledge spaces** (general, project, agent) that drive RAG.
  - Mentions the use of **RAG**, **CrewAI**, **Ollama** (phi4‑mini, qwen2.5‑coder:3b), and **Supabase vector** at a conceptual level.
  - Acknowledges existing Next.js/i18n/auth/theming shell as the UI host rather than the core of the product itself.
  - Captures that each **organization** has its own model/embedding configuration (`org_model_configs`) backed by an `embedding_models` registry, and that RAG queries always route through this configuration and the org’s current embedding version.
- The orgs/seats and **Phase 1 core** planning details are captured in `orgs-seats-and-phase1-core_*.plan.md`; the initial schema and API work for organizations and knowledge spaces has been implemented. **Database (Supabase):** `organizations`, `org_memberships`, `roles`, `org_model_configs`, `embedding_models`, `org_provider_secrets`, `knowledge_spaces`, `documents`, `document_chunks` (with `embedding_version`, `embedding_model`), `agents`, `skills`, `agent_skills`, `agent_knowledge_spaces`, plus permissions/seats tables. Local migrations under `supabase/migrations/` include 20260312_* for org_model_configs, embedding_models, document_chunks versioning, and org_provider_secrets.
- Future tasks should:
  - Update `progressState.md` when major features are implemented (knowledge spaces, skills registry, agent creator, crews, orgs/seats).
  - Update this `activeContext.md` whenever the main focus shifts to a new feature area.
  - Keep `projectBrief.md` and `productContext.md` synced with any large product or architecture decisions.

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

