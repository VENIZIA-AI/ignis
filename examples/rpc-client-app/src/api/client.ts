import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import type { paths } from "./schema";

const TOKEN_KEY = "ignis.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Relative: the Vite dev server proxies /api to rpc-api-server.
export const fetchClient = createFetchClient<paths>({ baseUrl: "/api" });

// Once signed in, every request carries the token.
fetchClient.use({
  onRequest: ({ request }) => {
    const token = tokenStore.get();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
});

/** Typed hooks: `$api.useQuery("get", "/configurations")` knows the path, the body and the reply. */
export const $api = createClient(fetchClient);
