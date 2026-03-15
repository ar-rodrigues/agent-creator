export type Skill = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  /** JSON configuration for skill execution (tools, allowed scopes, etc.) */
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateSkillInput = {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateSkillInput = Partial<CreateSkillInput>;
