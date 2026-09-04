export type Plant = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Metric = {
  id: number;
  plant_id: number;
  metric_type: string;
  value: number;
  created_at: string;
};

export type ApiKey = {
  id: number;
  name: string;
  scope: "read" | "write";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type Scope = "read" | "write";

export type TokenPair = {
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
};

export type SessionAuth = {
  kind: "session";
  cookies: string[];
};

export type ApiKeyAuth = {
  kind: "apiKey";
  scope: Scope;
  id: number;
};

export type Authentication = SessionAuth | ApiKeyAuth | null;
