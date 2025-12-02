import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";

type Props = { children: ReactNode };

/**
 * Composition of all app-level providers
 * Add new providers here as needed (e.g., Router, Theme, Auth)
 */
export function AppProviders({ children }: Props) {
  return <QueryProvider>{children}</QueryProvider>;
}
