/**
 * Module keys — must match module_catalog.key values in the database.
 * Update both this enum and the DB seed when adding a new module.
 */
export const MODULE_KEYS = {
  KNOWLEDGE: "KNOWLEDGE",
  SKILLS: "SKILLS",
  CREWS: "CREWS",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

/** Source options for org_module_states.source (mirrors DB check constraint). */
export type ModuleToggleSource = "manual" | "billing" | "default";
