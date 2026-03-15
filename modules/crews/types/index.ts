export type Crew = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  /** JSON configuration: agent IDs, orchestration mode, etc. */
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateCrewInput = {
  name: string;
  description?: string;
  config?: Record<string, unknown>;
};

export type UpdateCrewInput = Partial<CreateCrewInput>;
