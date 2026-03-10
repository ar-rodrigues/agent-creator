## Progress State – Agent & Skill Creator

### Current State

The project has:

- A working **Next.js App Router** shell with:
  - Localized public and private layouts (en/es).
  - Theming (light / dark / system) via a `ThemeProvider` and design tokens.
  - Supabase‑based authentication and a basic private dashboard area.
- A **Memory Bank skill** and `.cursorrules` that expect this `.memory/` folder.
- This iteration of the Memory Bank aligned with the **agent + skill + knowledge space** vision (not just the current Next.js implementation details).

### Recently Completed

- **Memory Bank & vision alignment**
  - Re‑created `.memory/projectBrief.md` to focus on:
    - The product as an **Agent & Skill Creator**.
    - Explicit concepts of **Skills**, **Agents**, and **Knowledge spaces** (general, project, agent).
    - RAG and CrewAI as core building blocks.
  - Re‑created `.memory/productContext.md` to describe:
    - Flows for **managing knowledge spaces and files**.
    - Flows for **creating/editing skills** (reusable tools with scope).
    - Flows for **creating/editing agents** (skills + knowledge spaces).
    - How single‑agent and multi‑agent (crew) runs should behave.
  - Set up `.memory/progressState.md` and `.memory/activeContext.md` again so they track high‑level progress and the current task.

- **App shell (from earlier work)**
  - Public/private layouts, auth flows, i18n, theming, and basic dashboard shell are in place to host the future agent/skill/knowledge UI.

- **Orgs, seats & permissions (Phase 1 implementation)**
  - Added Supabase migrations (and applied them via `user-supabase` MCP) for:
    - `organizations`, `org_memberships`, `permission_codes`, `seat_types`, `seat_type_permissions`, `org_seats`, and `seat_assignments` with RLS and an organization‑creator trigger.
    - `projects`, `knowledge_spaces`, `documents`, `document_knowledge_spaces`, and `document_chunks` with org‑scoped RLS.
    - A private `documents` storage bucket with org‑scoped policies based on `public.is_org_member_for_storage_path`.
    - Foundational tables for `agents`, `skills`, `agent_skills`, and `agent_knowledge_spaces` with org‑scoped RLS.
  - Implemented permission helpers (`lib/permissions.ts`) and API endpoints:
    - `/api/permissions`, `/api/orgs`, `/api/knowledge-spaces`, `/api/documents/upload`.
  - Implemented org‑aware frontend flows:
    - Org creation page and flow, plus an organization selector in `PrivateHeader`.
    - Dashboard behavior that requires an org and exposes a **Knowledge** section per org.
  - Built initial knowledge UI:
    - `useKnowledgeSpaces` hook and `/dashboard/knowledge` page to list and create knowledge spaces.
    - File upload flow that stores documents in the `documents` bucket and links them to knowledge spaces.
  - Added an org‑scoped RAG retrieval stub in `lib/rag/retrieve.ts` that fetches chunks from `document_chunks` filtered by `org_id` and knowledge spaces.

### Next

> These are high‑level next steps; refine them into concrete tickets as you go.

- **Phase 1 – Knowledge & storage (follow‑ups)**
  - Implement the **chunking and embeddings pipeline** for `document_chunks` using the chosen embedding provider.
  - Extend the RAG retrieval stub into a full similarity search over embeddings (top‑k per query).
  - Add basic document listing and per‑space views in the UI (beyond upload + space listing).

- **Phase 2 – Skills layer**
  - Implement a **skills registry** (DB + API) for defining skills as programmatic tools.
  - Add an LLM abstraction for Ollama models with a stable interface.
  - Wire up programmatic tool calling for skills (and/or a prompt‑based protocol as a fallback).
  - Build initial **Skills UI** in the dashboard to create/edit skills.

- **Phase 3 – Agents & crews**
  - Implement **agent configuration** (instructions, model, chosen skills, attached knowledge spaces).
  - Implement a single‑agent run end‑to‑end from the UI using RAG over the agent’s knowledge space union.
  - Introduce **crews** (multi‑agent runs) via CrewAI for scenarios that benefit from parallelism.
  - Build **Agent Creator UI** to manage agents and trigger runs.

- **Phase 4 – Orgs, seats & permissions**
  - Design and implement **organizations**, **memberships**, **roles**, and **seat usage** as the foundation for multi-tenant usage.
  - Wire `org_id` ownership into agents, skills, knowledge spaces, files, and runs.
  - Enforce role-based permissions for creating/editing/running agents and managing knowledge.
  - Prepare for future per-seat billing without implementing billing in this phase.

### Pending / Follow-up (Supabase JWT signing)

- **Switch back to ECC (P-256 / ES256) JWT signing when Supabase fixes the bug**
  - **Context:** The project was briefly on ES256 signing. PostgREST has a known bug ([Supabase issue #42235](https://github.com/supabase/supabase/issues/42235)): JWT claims are not set before RLS `with check` evaluation when using ES256, so `auth.uid()` is null in INSERT policies and direct inserts fail with 42501. RPC functions work because JWT claims are set in that execution path.
  - **Current state:** Rolled back to **Legacy HS256 (Shared Secret)** in Supabase Dashboard → Settings → JWT Keys so direct INSERT + RLS works normally. Org creation still uses the RPC `create_organization_for_user` (works on both HS256 and ES256).
  - **When to do it:** After Supabase fixes the bug (or confirms ES256 + RLS work on hosted PostgREST). Then in Dashboard → JWT Keys: create/rotate to ECC (P-256) and optionally simplify org creation back to direct INSERT if desired.
  - **Reference:** Migrations `20260310125000_organizations_insert_policy_secdef.sql`, `20260310126000_create_organization_rpc.sql`; route `app/api/orgs/route.ts` (RPC call).

### Immediately next (concrete actions)

- Design and document the **organizations / memberships / seats** schema.
- Decide how to pick the **current organization** in the UI (simple selector in dashboard vs. URL-based).
- Sketch the first **organization management screen** (view org details, list members and roles).

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

