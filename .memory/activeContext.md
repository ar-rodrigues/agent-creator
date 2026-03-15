## Active Context – Agent & Skill Creator

### Current Task

**Module-first architecture has been implemented.** The project now has system-managed per-org module toggles, module scaffolding for Skills and Crews, and a system-admin UI to manage module states. **Next focus:** Extend RAG retrieval to full similarity search (top-k, org + knowledge spaces + version-aware); then build out the Skills registry (Phase 2) by adding skills CRUD APIs and UI under `modules/skills/`.

### Focus / Notes

- **Module system** (just shipped):
  - DB: `system_user_roles`, `module_catalog`, `org_module_states` with RLS.
  - Server: `lib/modules/server.ts` (`verifyModuleAccess`, `assertSystemAdmin`, `isModuleEnabledForOrg`).
  - APIs: `/api/orgs/[orgId]/modules`, `/api/system/modules`, `/api/system/admin-check`.
  - UI: `modules/shared/ModuleGuard.tsx`, module-aware sidebar nav, `/system/modules` management page.
  - Modules: `modules/skills/` and `modules/crews/` scaffolded with types, constants, barrels.
  - To make a user a system admin: insert a row into `system_user_roles` with the user's id and the `admin` role_id from `public.roles`.
  - **When adding new modules:** consult **`modules/DEVELOPER_MANUAL.md`** (process, DB ↔ code link, checklist). Dashboard pages must always gate with `verifyModuleAccess` using the active org so direct URL access is blocked when the module is off.
  - **Exhaustive checks:** When branching on `ModuleKey`, use a `switch` with `default: const _exhaustive: never = moduleKey` so new modules cause a compile-time error until branches are updated (see .cursorrules and DEVELOPER_MANUAL).

- **Knowledge page** (`app/[locale]/(private)/dashboard/knowledge/`): streaming QA, context token usage, localized summaries, reindex status.
- **Org settings** (`app/[locale]/(private)/org/settings/page.tsx`): model config, embedding dimension, provider secrets, reindex flow.
- **Memory Bank:** updated with module architecture on 2026-03-15. Update progressState when shipping features; update activeContext when shifting focus.

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

