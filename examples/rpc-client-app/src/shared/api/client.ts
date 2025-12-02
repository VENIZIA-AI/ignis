import createFetchClient from "openapi-fetch";
import type { paths } from "./types";
import { API_CONFIG } from "@/shared";

export const fetchClient = createFetchClient<paths>({
  baseUrl: API_CONFIG.baseUrl,
});
