export interface Env {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  WORKOS_CLIENT_ID: string;
  WORKOS_API_KEY: string;
  USER_SESSIONS: KVNamespace;
  ASSETS: Fetcher;
  AI_GATEWAY_ID?: string;
}
