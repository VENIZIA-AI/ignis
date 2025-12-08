import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { RouterProvider } from "./router-provider";

type Props = { children: ReactNode };

/**
 * Composition of all app-level providers
 * Adds new providers here as needed (e.g., Router, Theme, Auth)
 */
export function AppProviders({ children }: Props) {
  return (
    <RouterProvider>
      <QueryProvider>{children}</QueryProvider>
    </RouterProvider>
  );
}
