import { MODULE_KEYS } from "@/lib/modules/constants";

export const CREWS_MODULE_KEY = MODULE_KEYS.CREWS;

/** Permission keys consumed by the crews module. */
export const CREWS_PERMISSIONS = {
  READ: "CREW_READ",
  CREATE: "CREW_CREATE",
  UPDATE: "CREW_UPDATE",
  DELETE: "CREW_DELETE",
  RUN: "CREW_RUN",
} as const;
