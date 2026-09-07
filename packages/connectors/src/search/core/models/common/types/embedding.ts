/** Embedding-model config for a server-side auto-embedded vector field: built-in models need only `name`, remote providers add `apiKey` and/or auth fields, and compilers map these camelCase keys to wire vocabulary. Source secrets from env - never hardcode them into a committed schema. */
export interface ISearchEmbedModelConfig {
  /** Built-in (`ts/...`) or remote (`openai/...`, `google/...`, `azure/...`). */
  name: string;
  /** Remote providers (OpenAI, Google, Azure). */
  apiKey?: string;
  /** Azure / self-hosted endpoints. */
  url?: string;
  // GCP Vertex AI auth.
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  projectId?: string;
  /** Escape for any provider field not modeled above; pass it already in the target engine's wire form. */
  [key: string]: unknown;
}

export interface ISearchEmbedConfig {
  from: string[];
  model: ISearchEmbedModelConfig;
}
