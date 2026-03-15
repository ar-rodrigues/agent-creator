# Module Developer Manual

This document describes how to add and maintain **product modules** in Agent Creator. Modules are feature areas (e.g. Knowledge, Skills, Crews) that can be enabled or disabled per organization by **system admins** (not org admins).

---

## How the database links to the code

The link is the **module key** string (e.g. `"KNOWLEDGE"`, `"SKILLS"`, `"CREWS"`).

| Layer | Where it lives | Purpose |
|-------|----------------|---------|
| **Database** | `public.module_catalog.key` | Canonical list of modules; each row defines a module and its defaults. |
| **Database** | `public.org_module_states.module_key` | Per-org enabled/disabled state; references `module_catalog.key`. |
| **Code** | `lib/modules/constants.ts` → `MODULE_KEYS` | TypeScript enum of keys; **must match** `module_catalog.key` values used in the DB. |
| **Layout** | `app/[locale]/(private)/layout.tsx` | Reads `org_module_states` for the active org and shows/hides nav links by key (e.g. `MODULE_KEYS.CREWS`). |
| **Pages** | `app/[locale]/(private)/dashboard/<module>/page.tsx` | Call `verifyModuleAccess({ orgId, userId, moduleKey: MODULE_KEYS.<MODULE> })`; redirect if `!access.ok`. |
| **APIs** | `app/api/...` for the module | Call `verifyModuleAccess` (or `assertSystemAdmin` for system-only routes) before doing work. |

If you add a row to `module_catalog` with a new `key`, that key must exist in `MODULE_KEYS` and the layout must be updated to show the nav link when that module is enabled. Conversely, if you add a new key to `MODULE_KEYS`, you must add a corresponding row to `module_catalog` (via migration) and wire the layout and page.

---

## TypeScript: exhaustive checks for module unions

When you have code that branches on the module key (e.g. `ModuleKey` or the union of all keys), handle **every** case explicitly. Use a `default` branch that assigns the value to `never` so that adding a new module to `MODULE_KEYS` causes a TypeScript error until you add a case:

```ts
function getModuleLabel(moduleKey: ModuleKey): string {
  switch (moduleKey) {
    case "KNOWLEDGE":
      return "Knowledge";
    case "SKILLS":
      return "Skills";
    case "CREWS":
      return "Crews";
    default: {
      const _exhaustive: never = moduleKey; // errors if a new key is added and no case above
      return _exhaustive;
    }
  }
}
```

This keeps branch logic in sync when new modules are added.

---

## Process for adding a new module

Follow these steps so the new module is gated correctly and appears in the UI only when enabled for the current org.

### 1. Add the module key to the codebase

- **File:** `lib/modules/constants.ts`
- Add a new entry to `MODULE_KEYS`, e.g. `MY_MODULE: "MY_MODULE"`.
- The value must be the string you will use in the database (same as `module_catalog.key`).

### 2. Add the module to the database

- Create a new migration (e.g. `supabase/migrations/YYYYMMDDHHMMSS_add_my_module.sql`).
- Insert (or upsert) a row into `public.module_catalog`:

```sql
insert into public.module_catalog (key, name, description, is_core, default_enabled_for_new_orgs, sort_order)
values (
  'MY_MODULE',
  'My Module',
  'Short description for system admin UI.',
  false,
  false,
  40
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  is_core = excluded.is_core,
  default_enabled_for_new_orgs = excluded.default_enabled_for_new_orgs,
  sort_order = excluded.sort_order,
  updated_at = now();
```

- **New organizations** created after this migration will get a row in `org_module_states` for `MY_MODULE` automatically (via the `handle_organization_created` trigger), with `enabled = default_enabled_for_new_orgs`.
- **Existing organizations** do **not** get the new module automatically. Either:
  - Run a one-off backfill (insert into `org_module_states` for each existing org and the new module key), or
  - Let system admins enable the module per org from the System admin → Module management UI.

### 3. Create the module folder and barrel

- **Folder:** `modules/<module-name>/` (e.g. `modules/my-module/`).
- Recommended structure:
  - `api/` — server-only business logic (no route handlers).
  - `components/` — React components for this module.
  - `hooks/` — custom hooks (e.g. data fetching).
  - `types/` — TypeScript types.
  - `constants.ts` — module key and permission keys (re-export or use `MODULE_KEYS.MY_MODULE`).
  - `index.ts` — public barrel; other code should import from `modules/my-module`, not from subpaths.

### 4. Add the dashboard route and gate it

- **Route:** `app/[locale]/(private)/dashboard/<module>/page.tsx` (e.g. `dashboard/my-module/page.tsx`).

The page **must** enforce module access so that direct URL access (e.g. `/dashboard/my-module`) is blocked when the module is disabled for the user’s org. Do **not** rely only on hiding the nav link.

- Resolve the **active org** the same way as the private layout: query the user’s organizations, take the first by `created_at` (or use the same heuristic your layout uses).
- Call `verifyModuleAccess({ orgId: activeOrgId, userId: user.id, moduleKey: MODULE_KEYS.MY_MODULE })`.
- If there is no org or `!access.ok`, redirect to the dashboard (or an appropriate error page).

Example (server component):

```ts
const { data: orgs } = await supabase
  .from("organizations")
  .select("id")
  .order("created_at", { ascending: true });
const activeOrgId = Array.isArray(orgs) && orgs.length > 0 ? orgs[0].id : null;

if (!activeOrgId) {
  nextRedirect(`${prefix}/dashboard`);
}

const access = await verifyModuleAccess({
  orgId: activeOrgId,
  userId: user.id,
  moduleKey: MODULE_KEYS.MY_MODULE,
});
if (!access.ok) {
  nextRedirect(`${prefix}/dashboard`);
}
```

### 5. Wire the sidebar navigation

- **File:** `app/[locale]/(private)/layout.tsx`
- The layout already loads `moduleStates` for the active org and derives booleans like `isCrewsEnabled`. Add a similar boolean for your module (e.g. `isMyModuleEnabled`) from `moduleStates[MODULE_KEYS.MY_MODULE]?.enabled`.
- Add a conditional nav link:

```tsx
{isMyModuleEnabled && (
  <Link href="/dashboard/my-module" className={styles.navLink}>
    {t("myModule")}
  </Link>
)}
```

- Add the translation key for the label to `messages/en.json` and `messages/es.json` (e.g. under `common.myModule`).

### 6. Add API routes and gate them

- For any API route that serves this module (e.g. `app/api/my-module/...` or `app/api/orgs/[orgId]/my-module/...`), call `verifyModuleAccess` (with the request’s org and user and `MODULE_KEYS.MY_MODULE`) before performing the action. Return 403 if `!access.ok`.

### 7. Optional: client-side gating with ModuleGuard

- For client components that should show a “module disabled” state instead of making a request that will 403, use the `ModuleGuard` component from `modules/shared/ModuleGuard.tsx`, passing the result of `useOrgModules(orgId)` and the module key.

---

## Checklist for a new module

- [ ] `MODULE_KEYS` in `lib/modules/constants.ts` includes the new key.
- [ ] Migration adds (or updates) the row in `module_catalog` with the same key.
- [ ] `modules/<module>/` folder exists with at least `constants.ts` and `index.ts` (and optionally `api/`, `components/`, `hooks/`, `types/`).
- [ ] Dashboard page at `app/[locale]/(private)/dashboard/<module>/page.tsx` exists and **always** calls `verifyModuleAccess` with the active org (not only when `orgId` is in query params); redirects if no org or access denied.
- [ ] Private layout shows the nav link only when `moduleStates[MODULE_KEYS.<MODULE>]?.enabled` is true.
- [ ] Translation keys for the nav label (and any other UI strings) added to `messages/en.json` and `messages/es.json`.
- [ ] Any API routes for the module call `verifyModuleAccess` (or `assertSystemAdmin` for system-only endpoints) before doing work.
- [ ] If existing orgs should have the module by default, run a backfill or document that system admins can enable it per org from the System admin UI.
- [ ] Any code that switches on `ModuleKey` uses an exhaustive `switch` with `default: const _exhaustive: never = moduleKey` (see "Exhaustive checks for module unions" above).

---

## Summary: why direct URL access was possible before

The Crews (and Skills) pages originally ran `verifyModuleAccess` only when `orgId` was present in the URL search params. When a user opened `/dashboard/crews` from the address bar or a bookmark, no `orgId` was passed, so the check was skipped and the page rendered. The fix is to **always** resolve the active org (same as the layout) and run `verifyModuleAccess` for that org; if the module is disabled, redirect to dashboard. The same pattern is required for every new module page.
