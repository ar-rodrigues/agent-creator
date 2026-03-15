## Product Context – Agent & Skill Creator

### Target Users

- Developers / technical users who want to **create and manage agents and skills**.
- Users who need to run **document‑centric workflows** over uploaded files:
  - Financial analysis across many reports.
  - Brand consistency checks against visual/branding docs.
  - Project‑specific investigations (e.g. “Report January 2026”).

> TODO (maintainer): Refine personas (internal team vs. SaaS customers vs. open‑source users) and their primary jobs‑to‑be‑done.

---

### Core Concepts

- **Skill**
  - A reusable “tool” that can be attached to different agents.
  - Examples:
    - `FinancialReportAnalysis` – reads financial documents and produces structured analysis.
    - `BrandConsistencyCheck` – checks drafts against brand guidelines.
  - Behaviors:
    - Implemented as one or more programmatic tools (CrewAI/Open Agent, API calls, RAG queries, etc.).
    - Declares which **knowledge scopes** it can use:
      - `general`, `project`, `agent`, or combinations.

- **Knowledge space**
  - A logical collection of documents with a **scope**:
    - **General** – company‑wide or global (e.g. all finance policies, brand guidelines).
    - **Project** – limited to a project (e.g. “Report Jan 2026”).
    - **Agent** – extra docs only this agent sees.
  - Files are stored once and **linked** to one or more knowledge spaces.
  - Vector embeddings are stored per knowledge space (and can also be tagged with project/agent).

- **Agent**
  - A configuration that combines:
    - **Instructions / role** (system prompt).
    - A set of **skills**.
    - One or more **knowledge spaces** (general + project + agent‑specific).
    - Model selection (e.g. which Ollama model).
  - At run‑time, RAG queries run over the **union** of the attached knowledge spaces.

- **Crew (multi‑agent run)**
  - A group of agents with different roles and skills working together on a task.
  - Orchestrated via CrewAI (or similar).

- **Organization**
  - A tenant/workspace that owns agents, skills, knowledge spaces, and runs.
  - All agent and skill configurations are scoped to a single organization.
- **Membership**
  - Links a Supabase auth user to an organization with a **role**:
    - `owner`, `admin`, `member`, `viewer`.
  - A user can belong to multiple organizations via separate memberships.
- **Seat**
  - Conceptually, a seat is an **active non-viewer membership** in an organization.
  - Phase 1 uses seat counts mainly for permissions and future billing readiness; billing itself is deferred.

---

### Current / Intended User Flows

This section focuses on **product behavior**, not low‑level implementation.

#### 1. Manage knowledge spaces and files

- **Upload files**
  - User uploads files (PDF, DOCX, text, etc.).
  - The system stores them and associates them with one or more **knowledge spaces**.

- **Define knowledge spaces**
  - User can create:
    - **General** spaces (e.g. “Company Finance Global”, “Company Brand Guide”).
    - **Project** spaces (e.g. “Report January 2026”).
    - Optional **Agent**‑level spaces for very specific docs.
  - For each space, the user:
    - Names it, describes purpose.
    - Attaches or removes files.
  - Spaces can have **localized summaries** (per locale); summaries are generated/refreshed from the UI. Document upload triggers chunking and embedding; changing org embedding model/dimension triggers a **reindex** (background re-embed of all org documents).

- **Example**
  - General knowledge:
    - `CompanyFinanceGlobal`, `CompanyBrandGuide`.
  - Project knowledge:
    - `ReportJan2026Docs`.

#### 2. Create and manage skills (reusable tools)

- **Create a skill**
  - User defines a new skill with:
    - Name, description, and purpose.
    - Underlying implementation (e.g. call into a RAG tool, call an external API, run a CrewAI tool).
    - Allowed **knowledge scopes** (`general`, `project`, `agent`).
  - The system stores this in a **skills registry** so it can be reused by multiple agents.

- **Edit a skill**
  - User can refine the description, implementation, and allowed scopes.

- **Use cases**
  - A `FinancialReportAnalysis` skill might:
    - Take a question or task.
    - Query financial knowledge spaces.
    - Return a structured answer.

#### 3. Create and manage agents

- **Create an agent**
  - User configures:
    - Agent name and description.
    - High‑level instructions / role.
    - Default model (e.g. `phi4-mini` vs `qwen2.5-coder:3b`).
    - **Skills**: choose from the skill registry.
    - **Knowledge spaces**:
      - Attach **general** spaces (e.g. “Company Brand”).
      - Attach **project** spaces (e.g. “Report Jan 2026”).
      - Optionally create/attach an **agent‑specific** space.

- **Example configuration**
  - Agent: `Jan2026FinancialAnalyst`.
  - Skills:
    - `FinancialReportAnalysis`.
    - `BrandConsistencyCheck`.
  - Knowledge spaces:
    - `CompanyFinanceGlobal`.
    - `CompanyBrandGuide`.
    - `ReportJan2026Docs`.
  - When this agent runs, RAG queries over the **union** of the three knowledge spaces.

#### 4. Run agents and crews

- **Single‑agent runs**
  - User selects an agent and provides an input (question, task description, or document).
  - The system:
    - Builds the prompt using agent instructions.
    - Exposes skills as tools to the LLM / agent runtime.
    - RAG tools use only the agent’s attached knowledge spaces (respecting skill scope rules).
  - User sees:
    - Final answer.
    - Optionally, which skills/knowledge spaces were used.

- **Multi‑agent (crew) runs**
  - User defines a **crew** that includes several agents with different roles.
  - CrewAI (or similar) runs agents **in parallel** where appropriate.
  - Useful for:
    - Decomposing large analyses.
    - Having separate “analyst”, “checker”, and “writer” agents.

#### 5. Organizations, members, and seats (planned Phase 1 behavior)

- **Create or join an organization** (planned)
  - When a user signs in for the first time, they can:
    - Create a new organization (becoming its `owner`), or
    - Accept an invitation to an existing organization.
- **Invite members and manage seats** (planned)
  - Owners/admins can invite other users by email and assign them roles.
  - The total number of active non-viewer memberships represents the org’s seat usage.
  - Billing and hard seat enforcement are planned for later phases.
- **Switch organizations** (planned)
  - If a user belongs to multiple organizations, they can switch the **active organization** in the UI.
  - All visible agents, skills, knowledge spaces, and runs are filtered by the currently selected organization.

---

### Internationalization & UI Shell (Current App)

The current Next.js app already provides a localized, themed shell that this product will live inside:

- **Locales**
  - English (`en`) and Spanish (`es`), with locale‑aware routing.

- **Layouts**
  - Public layout:
    - Landing page and auth entry points.
    - Language switcher and theme toggle.
  - Private layout:
    - Auth‑guarded dashboard where agent/skill/knowledge management UIs will live.

- **Theming & layout**
  - Light/dark/system theme via a `ThemeProvider`.
  - Reusable layout primitives (`Container`, `Stack`, cards) to keep screens consistent.

These behaviors are already implemented and reused by the future agent/skill/knowledge screens.

---

### Error Handling & UX Intent

- **Error surface**
  - API / orchestration errors (CrewAI, RAG, uploads) should be surfaced through:
    - Clear messages in the UI (not just console logs).
    - Where possible, actionable suggestions (e.g. “This agent has no knowledge spaces attached”).

- **Knowledge visibility**
  - It should always be clear **which knowledge spaces** an agent used for a run.
  - Users should be able to understand why an answer might be missing information (e.g. project space not attached).

- **Knowledge page (current implementation)**
  - **General QA chat**: Users ask questions over org knowledge; optional selection of general knowledge spaces; provider choice (local / Gemini / Claude). Responses stream in real time with a stop button. Answers show sources (document/space/chunk). Implemented via `useRagGeneral` (`askStreaming`), `/api/rag/general` and `/api/rag/general/stream`.
  - **Context usage**: Token estimation for the conversation (question + messages) is shown (e.g. tooltip) so users stay within the model’s context window (`lib/utils/tokens.ts`, `CONTEXT_WINDOW_MAX_TOKENS`).
  - **Knowledge space summaries**: Each space can have **localized summaries** (`summary_i18n` by locale). Summary is generated/refreshed via `POST /api/knowledge-spaces/[spaceId]/summary` with a locale; the UI prevents concurrent summary updates for the same space/locale. The first general space’s summary drives the Knowledge overview title/summary.
  - **Reindex status**: When the org’s embedding config changes, a background reindex runs. The UI shows reindex progress (e.g. via `ReindexContext`: `isReindexing`, `total`, `done`). Reindex flow: reindex-pending → reembed per document → reindex-complete; on finish, a `reindex-finished` event refreshes model config so status goes to idle.

- **Org settings (current implementation)**
  - **Model configuration**: Chat and embedding provider/model chosen from backend registry (no free text). Mode filter (local / cloud / mixed). Org Settings uses `/api/orgs/[orgId]/models` (registry + Ollama discovery).
  - **Embedding dimension**: When the selected embedding model supports it (`dimensionConfigurable`, `allowedDimensions`), the UI lets admins set the **embedding dimension**; org config stores `embeddingDimension`. Changing embedding config (including dimension) triggers the reindex flow above.
  - **Provider secrets**: API keys for external providers (OpenAI, Anthropic, Google) are stored in `org_provider_secrets` (encrypted); UI to set/clear keys; `api_key_last4` for display. Used by RAG/chat when provider is not local.
  - **Reindex status**: Same reindex progress display as on the Knowledge page (shared `ReindexContext`).
  - The backend `embedding_models` table records provider, name, kind (chat vs embedding), vector dimension (and dimension configurability), and locality. Changes to embedding config trigger background reindex; RAG uses the previous embedding version until reindex completes (at most two versions per org).

- **Auditability (future)**
  - For more advanced users, we may expose:
    - Which chunks were retrieved via RAG.
    - Which skills were called (and in what order).

> TODO (maintainer): As the UI for skills/agents/knowledge spaces is implemented, update this file with concrete screens and flows, including any orgs/seats/phase‑1 specifics.

## Product Context – Agent Creator

### Target Users

- Developers and technical users who want to **create and manage agents and skills**.
- Likely familiar with modern web apps, authentication flows, and localization.

> TODO (maintainer): Refine target personas (e.g. internal team vs. open-source community vs. SaaS customers) and their primary goals.

### Core User Flows (Current Implementation)

#### 1. Landing & Entry

- Visitors arrive at the localized landing page:
  - `app/[locale]/(public)/page.tsx` uses `next-intl` to render a translated hero section (`messages/*home*`).
  - Primary calls-to-action:
    - “Sign in” → `/auth`
    - “Sign up” → `/auth?mode=signup`
- Layout:
  - `PublicLayout` (`app/[locale]/(public)/layout.tsx`) wraps all public pages with:
    - `PublicHeader` (logo, theme toggle, language switcher).
    - `Footer` (home link and copyright).

#### 2. Authentication

Auth is handled primarily by:

- `hooks/useAuth.ts` – centralized client-side auth hook (Supabase-based).
- `hooks/useSupabaseClient.ts` – memoized browser Supabase client access.
- Auth pages and components under `app/[locale]/(public)/auth/*`.

**Auth flows:**

- **Sign in**
  - Route: `/auth` (localized via `[locale]`).
  - Component: `AuthForm` with “Sign in” tab.
  - Uses Supabase `signInWithPassword` through `useAuth.signIn`.
  - On success:
    - Shows a success message via `App.useApp().message.success`.
    - Redirects to `/dashboard`.

- **Sign up**
  - Route: `/auth?mode=signup` (or “Sign up” tab).
  - Uses Supabase `signUp` through `useAuth.signUp`, including optional `emailRedirectTo` pointing at `/auth/callback`.
  - Behavior:
    - If Supabase returns `needsConfirmation`:
      - Redirect to `app/[locale]/(public)/auth/check-email/page.tsx`.
    - Otherwise:
      - Shows a success message and redirects to `/dashboard`.

- **Email confirmation**
  - After sign up with email confirmation required, the user is directed to the **Check email** page:
    - `app/[locale]/(public)/auth/check-email/page.tsx`, using `messages/*auth*` keys like `checkEmailPageTitle` and `checkEmailPageDescription`.
  - A Supabase auth callback is handled by:
    - `app/[locale]/(public)/auth/callback/route.ts`
      - Exchanges `code` for a Supabase session via `createSupabaseServerClient`.
      - Redirects either:
        - Back to `/auth` with an `error=` query parameter, or
        - Forward to the `next` path (default `/dashboard`).

- **Password reset**
  - “Reset password” tab in `AuthForm` uses `useAuth.resetPassword`.
  - Sends a password reset email with `redirectTo` pointing to `/auth/callback`.
  - On success:
    - Sets `forgotSent` state and shows a non-blocking success `Alert` with localized copy.

- **Session invalidation**
  - If a user’s Supabase session is invalid during a private-page request, the private layout:
    - Detects missing `user` via `createSupabaseServerClient().auth.getUser()`.
    - Redirects to `/auth?session_invalid=1` (with locale prefix as needed).
  - The `/auth` page:
    - Checks `session_invalid` from search params.
    - If set and the client still has a `user`, it triggers `signOut()` then redirects back to `/auth` to clear stale state.

- **Sign out**
  - `SignOutButton` (in `PrivateHeader`) uses `useAuth.signOut()` and then:
    - Redirects to `/`.
    - Calls `router.refresh()` to invalidate client state.

#### 3. Dashboard (Private Area)

- Route: `/dashboard` under `app/[locale]/(private)/dashboard/page.tsx`.
- Layout:
  - `PrivateLayout` enforces authentication server-side:
    - Uses `createSupabaseServerClient` to read cookies and retrieve `auth.getUser()`.
    - If no user exists, redirects to localized `/auth?session_invalid=1`.
  - Renders:
    - `PrivateHeader` with logo, theme toggle, language switcher, and sign-out button.
    - Sidebar navigation (link to “Dashboard”).
    - Main content area for private modules.
- Current implementation:
  - A placeholder dashboard explaining that this is where private content and modules will be added.

> TODO (maintainer): Define and implement the concrete dashboard features for managing agents and skills (lists, detail views, creation/editing flows, etc.).

### Internationalization Behavior

- Locales configured in `i18n/routing.ts`:
  - `locales`: `["en", "es"]`
  - `defaultLocale`: `"en"`
  - `localePrefix`: `"as-needed"` (no prefix for the default locale).
- Locale resolution and message loading:
  - `i18n/request.ts`:
    - Determines the effective locale from the request and `routing.locales`.
    - Dynamically imports `messages/<locale>.json`.
  - `app/[locale]/layout.tsx`:
    - Validates locale with `hasLocale`.
    - Calls `setRequestLocale`.
    - Wraps children with `NextIntlClientProvider` using loaded messages.
- Client-side navigation:
  - `i18n/navigation.ts` exposes `Link`, `useRouter`, `usePathname`, etc., which are locale-aware.
  - `LanguageSwitcher` uses:
    - `useLocale` from `next-intl`.
    - `routing.locales`.
    - Calls `router.replace(pathname, { locale: newLocale })` to switch language while staying on the same route.

### Theming & Layout

- **Theme selection**
  - `ThemeProvider` manages:
    - Preference: `"light" | "dark" | "system"`.
    - Resolved theme: `"light"` or `"dark"` based on preference and system settings.
    - Persists preference in `localStorage` under key `"theme"`.
    - Applies theme via:
      - `document.documentElement.dataset.theme`.
      - `document.documentElement.style.colorScheme`.
  - `ThemeToggle` provides a three-button toggle for `light` / `dark` / `system`.
- **Ant Design integration**
  - `Providers` wraps the app in:
    - `ThemeProvider`.
    - Ant Design `ConfigProvider` + `App`:
      - Chooses `defaultAlgorithm` or `darkAlgorithm` based on resolved theme.
      - Maps `colorPrimary` and other tokens to CSS variables.
  - Components like `AuthForm` use Ant Design form, input, tabs, and alert primitives, styled to match the design tokens.
- **Layout primitives**
  - `Container` and `Stack` encapsulate spacing, width, and flex behavior via CSS variables and tokens.
  - Pages compose these primitives to maintain consistent spacing and alignment.

### Error Handling & UX

- Authentication errors:
  - Captured in `useAuth` as a string (`AuthError`).
  - Displayed via Ant Design `Alert` on the auth forms when present.
  - URL-based errors (e.g. Supabase redirect with `?error=…`) are normalized by decoding and shown the same way.
- Middleware / server failures:
  - Supabase server/client helpers throw descriptive errors if required environment variables are missing.
  - `updateSession` middleware intentionally swallows `auth.getUser()` errors so they can be surfaced closer to the UI or route handlers instead of breaking middleware.
- Accessibility:
  - Toggle groups (`ThemeToggle`, `LanguageSwitcher`) use `role="group"` and `aria-pressed` for current state.
  - Forms label inputs and provide descriptive error messages using translations.

### Future Product & UX Intent (Placeholders)

> TODO (maintainer): Fill in this section as product decisions solidify.

Questions to answer here:

- What “agent” and “skill” objects look like from the user’s perspective (fields, actions, lifecycle).
- How users **create**, **edit**, **test**, and **publish** agents and skills.
- Which parts of the experience must be polished first (e.g. onboarding, templates, analytics).
- Any guardrails or safety features (limits, validation, review flows).

