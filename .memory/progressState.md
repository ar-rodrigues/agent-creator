## Progress State – Agent & Skill Creator

**Last updated:** 2025-03-15 — Memory synced with recent commits: Knowledge page (streaming QA, context token usage, localized summaries, reindex status); Org settings (embedding dimension config, reindex flow); embeddings concurrency/retry; layout i18n.

### Current State

The project has:

- A working **Next.js App Router** shell with:
  - Localized public and private layouts (en/es).
  - Theming (light / dark / system) via a `ThemeProvider` and design tokens.
  - Supabase‑based authentication and a basic private dashboard area.
- A **Memory Bank skill** and `.cursorrules` that expect this `.memory/` folder.
- **Knowledge** and **Org settings** flows are implemented with streaming QA, reindexing, localized summaries, and configurable embedding dimensions (see Recently Completed).

### Recently Completed

- **Knowledge page (`/dashboard/knowledge`)**
  - **General QA chat**: Streaming support (`/api/rag/general/stream`), stop button, optional knowledge space selection, provider choice (local / gemini / claude). Uses `useRagGeneral` with `askStreaming`; `ChatMessage` and `SourceBadge` for display.
  - **Context token usage**: Token estimation (`lib/utils/tokens.ts`, `estimateTokens`, `CONTEXT_WINDOW_MAX_TOKENS`) and tooltip showing context usage so users stay within model limits.
  - **Localized summaries**: Knowledge spaces have `summary_i18n` (per locale); summary generation via `POST /api/knowledge-spaces/[spaceId]/summary` with `locale`; concurrency guard to prevent duplicate summary updates per space/locale; refresh from UI.
  - **Reindex status**: Reindex progress shown in UI; `ReindexContext` provides `isReindexing`, `total`, `done`; reindex triggered when org embedding config changes.
  - **Components**: `KnowledgeOverview` (title/summary from first general space), `ChatMessage`, `SourceBadge`; layout/scrollbar and button style refinements; all strings from translation files.

- **Org settings (`/org/settings`)**
  - **Embedding dimension configuration**: UI and API support for configurable embedding dimensions; model registry exposes `dimension`, `dimensionConfigurable`, `allowedDimensions`; org config stores `embeddingDimension`; dimension selector in settings when the chosen embedding model supports it.
  - **Model configuration**: Chat and embedding provider/model selectors from `/api/orgs/[orgId]/models`; mode filter (local / cloud / mixed); provider secrets (OpenAI, Anthropic, Google) via `useOrgProviderSecrets` and `org_provider_secrets` table.
  - **Reindex flow**: On embedding config save, reindex runs in background via `ReindexProvider` (reindex-pending → reembed per document → reindex-complete); `reindex-finished` custom event refreshes model config so status goes from `in_progress` to `idle`.

- **Backend / embeddings**
  - **Embeddings pipeline**: `lib/rag/embeddings.ts` with custom concurrency limiter (p-limit upgrade), retry logic for rate limits, dynamic concurrency from API capabilities.
  - **APIs**: `POST /api/documents/[documentId]/reembed`, `GET /api/orgs/[orgId]/reindex-pending`, `POST /api/orgs/[orgId]/reindex-complete`; model config and summary routes updated for dimension and locale.

- **Layout & i18n**
  - Layout loads messages dynamically; sidebar styling improvements; dashboard, knowledge, and org settings pages use `next-intl` for all user-facing strings (en/es).

- **Earlier work (still current)**
  - Memory Bank & vision alignment; app shell; orgs, seats & permissions (migrations, RLS, storage, APIs); org-level model config & soft RAG migration; RAG general QA and provider secrets; document upload with embedding support.

### Recently Completed (2026-03-15) — Module-first architecture

- **DB foundation** (`20260315200000_module_catalog_and_org_states.sql`):
  - `public.system_user_roles` — system-level role assignments (reuses `public.roles`).
  - `public.module_catalog` — registry of modules (KEY, is_core, default_enabled_for_new_orgs).
  - `public.org_module_states` — per-org enabled/disabled with audit columns (updated_by, updated_reason, source).
  - `public.is_system_admin()` helper function.
  - RLS: org members read their own module states; system admins manage all.
  - Backfill: all existing orgs enabled for all modules.
  - `handle_organization_created` trigger extended to provision module states on new org creation.
  - Seeds: KNOWLEDGE (core, enabled for new), SKILLS (off), CREWS (off).

- **Server access layer** (`lib/modules/`):
  - `lib/modules/constants.ts` — `MODULE_KEYS`, `ModuleKey`, `ModuleToggleSource`.
  - `lib/modules/server.ts` — `getOrgModuleStates`, `isModuleEnabledForOrg`, `isSystemAdmin`, `assertSystemAdmin`, `verifyModuleAccess`.

- **APIs**:
  - `GET/PATCH /api/orgs/[orgId]/modules` — org members read; system admins toggle.
  - `GET/PATCH /api/system/modules` — system-admin cross-org bulk view and toggle.
  - `GET /api/system/admin-check` — returns whether current user is a system admin.

- **Client hook** (`hooks/useOrgModules.ts`) — `{ data, loading, error, refetch, isEnabled }`.
- **useSystemAdmin** hook (`hooks/useSystemAdmin.ts`) — checks system admin status client-side.

- **UI gating**:
  - `modules/shared/ModuleGuard.tsx` — client wrapper showing disabled state when module off.
  - Private sidebar now shows module-specific links only when enabled; "System admin" link visible to system admins only.
  - System admin modules management page at `/system/modules` with per-org toggle switches.

- **Module folder scaffolding**:
  - `modules/skills/` and `modules/crews/` created with `api/`, `components/`, `hooks/`, `types/`, `constants.ts`, `index.ts`.
  - Placeholder pages `dashboard/skills` and `dashboard/crews` with module access guards.

- **Translations**: `modules.*` and `systemAdmin.*` namespaces added to both `en.json` and `es.json`.
- **`.cursorrules`** updated with module-first placement, gating, and hook contract rules.

- **Module page gating fix (2026-03):** Crews and Skills dashboard pages now **always** run `verifyModuleAccess` using the active org (first org by `created_at`). Direct URL access to `/dashboard/crews` or `/dashboard/skills` when the module is disabled for that org now redirects to dashboard instead of rendering.
- **Developer manual:** `modules/DEVELOPER_MANUAL.md` added with the process for creating new modules, how the database links to the code, and a checklist. Memory Bank and `.cursorrules` updated to reference it.

### Next

> These are high‑level next steps; refine them into concrete tickets as you go.

- **Phase 1 – Knowledge & storage (in progress)**
  - Implement the **chunking and embeddings pipeline** for `document_chunks` using the chosen embedding provider.
  - Extend the RAG retrieval stub into a full similarity search over embeddings (top‑k per query) scoped by org and knowledge spaces and aware of embedding versions.
  - Add richer document listing and per‑space detail views in the UI (status, last indexed, file types, chunk counts, embedding version/migration status).

- **Phase 2 – Skills layer**
  - Implement a **skills registry** (DB + API) for defining skills as programmatic tools with metadata (name, description, allowed knowledge scopes).
  - Add an LLM abstraction for Ollama models with a stable interface for both chat and tool‑calling flows.
  - Wire up programmatic tool calling for skills (and/or a prompt‑based protocol as a fallback).
  - Build initial **Skills UI** in the dashboard to create/edit skills and inspect basic run logs.

- **Phase 3 – Agents & crews**
  - Implement **agent configuration** (instructions, default model, chosen skills, attached knowledge spaces).
  - Implement a single‑agent run end‑to‑end from the UI using RAG over the agent’s knowledge space union.
  - Introduce **crews** (multi‑agent runs) via CrewAI for scenarios that benefit from parallelism (e.g. analyst + checker).
  - Build **Agent Creator UI** to manage agents, crews, and run history.

- **Phase 4 – Orgs, seats & permissions (follow‑ups)**
  - Add organization management screens (view org details, list members and roles, show seat usage).
  - Enforce role‑based permissions for creating/editing/running agents and managing knowledge in the UI.
  - Keep the data model compatible with future per‑seat billing without implementing billing in this phase.

### Pending / Follow-up (Supabase JWT signing)

- **Switch back to ECC (P-256 / ES256) JWT signing when Supabase fixes the bug**
  - **Context:** The project was briefly on ES256 signing. PostgREST has a known bug ([Supabase issue #42235](https://github.com/supabase/supabase/issues/42235)): JWT claims are not set before RLS `with check` evaluation when using ES256, so `auth.uid()` is null in INSERT policies and direct inserts fail with 42501. RPC functions work because JWT claims are set in that execution path.
  - **Current state:** Rolled back to **Legacy HS256 (Shared Secret)** in Supabase Dashboard → Settings → JWT Keys so direct INSERT + RLS works normally. Org creation still uses the RPC `create_organization_for_user` (works on both HS256 and ES256).
  - **When to do it:** After Supabase fixes the bug (or confirms ES256 + RLS work on hosted PostgREST). Then in Dashboard → JWT Keys: create/rotate to ECC (P-256) and optionally simplify org creation back to direct INSERT if desired.
  - **Reference:** Migrations `20260310125000_organizations_insert_policy_secdef.sql`, `20260310126000_create_organization_rpc.sql`; route `app/api/orgs/route.ts` (RPC call).

### Immediately next (concrete actions)

- Extend RAG retrieval to full **similarity search** over embeddings (top‑k, org + knowledge spaces + version‑aware); chunking and reembed pipeline are in place.
- Add a minimal **documents/knowledge space detail** view in the dashboard to surface indexing status, chunk counts, and basic metadata.
- Consider Phase 2 (skills registry and LLM abstraction) once retrieval is solidified.

## Progress State – Agent Creator

### Current State

The project is a working Next.js 16 App Router application with:

- Supabase-based authentication (sign in, sign up, email confirmation, password reset, sign out).
- A localized public experience in English and Spanish using `next-intl`.
- Theming (light / dark / system) wired through a custom `ThemeProvider` and Ant Design.
- Structured layouts for public and private sections, including a basic authenticated dashboard shell.

### Recently Completed

- **App shell and layout**
  - Implemented root layout with `Geist` fonts and global styles (`app/layout.tsx`, `app/globals.css`).
  - Set up localized app layout under `app/[locale]/layout.tsx` with `NextIntlClientProvider`.
  - Created public and private route groups: `app/[locale]/(public)` and `app/[locale]/(private)`.
  - Added `PublicHeader`, `PrivateHeader`, and `Footer` components to frame the app.

- **Design system & theming**
  - Introduced centralized tokens in `styles/tokens.css` and wired them into `app/globals.css`.
  - Built reusable layout primitives: `Container`, `Stack`, and `Card`.
  - Implemented a theme context (`ThemeProvider`) with persistence and system-theme syncing.
  - Connected Ant Design theming to the resolved theme via `components/Providers.tsx`.
  - Added `ThemeToggle` component to switch between light/dark/system themes.

- **Internationalization**
  - Configured `next-intl` routing and middleware (`i18n/routing.ts`, `i18n/navigation.ts`, `i18n/request.ts`, `proxy.ts`).
  - Created localized message catalogs for English and Spanish (`messages/en.json`, `messages/es.json`).
  - Updated landing, auth, and check-email pages to use `next-intl` translations.
  - Implemented `LanguageSwitcher` component for quick locale switching on any page.

- **Authentication & session management**
  - Added Supabase server and browser clients using `@supabase/ssr` (`lib/supabase/server.ts`, `lib/supabase/client.ts`).
  - Implemented middleware-based session synchronization (`lib/supabase/middleware.ts`, `proxy.ts`).
  - Built `useAuth` and `useSupabaseClient` hooks to encapsulate auth and Supabase client usage.
  - Created `AuthForm` with sign-in, sign-up, and password reset tabs, wired to Supabase.
  - Implemented an auth callback route to exchange codes for sessions and redirect appropriately.
  - Enforced auth guard in the private layout, redirecting unauthenticated users to `/auth?session_invalid=1`.
  - Added `SignOutButton` that signs out and returns users to the public homepage.

- **Dashboard**
  - Added an initial authenticated dashboard page under `app/[locale]/(private)/dashboard/page.tsx` as a placeholder for future modules.
  - Integrated dashboard into the private layout’s sidebar navigation.

- **Memory Bank (this task)**
  - Recreated the `.memory/` folder with:
    - `projectBrief.md` – current goals, stack, architecture, and constraints.
    - `productContext.md` – documented user flows, UX, and behavior.
    - `progressState.md` – this file (captures high-level status and recent work).
    - `activeContext.md` – current focus/task metadata.

### Next

> TODO (maintainer): Replace these placeholders with concrete upcoming work items.

- Define and implement the first concrete “agent” and “skill” features in the dashboard (data model, UI, and Supabase integration).
- Polish onboarding and auth UX (copy, validation messages, edge cases).
- Add additional pages or navigation items as product requirements become clearer.
- Keep this file updated as significant features are implemented or shipped.

