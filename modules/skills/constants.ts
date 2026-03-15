import { MODULE_KEYS } from "@/lib/modules/constants";

export const SKILLS_MODULE_KEY = MODULE_KEYS.SKILLS;

/** Permission keys consumed by the skills module. */
export const SKILLS_PERMISSIONS = {
  READ: "SKILL_READ",
  CREATE: "SKILL_CREATE",
  UPDATE: "SKILL_UPDATE",
  DELETE: "SKILL_DELETE",
} as const;
