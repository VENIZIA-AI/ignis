import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

type Props = { children: ReactNode };

/**
 * Router provider wrapper for React Router
 * Uses BrowserRouter for client-side routing
 */
export function RouterProvider({ children }: Props) {
  return <BrowserRouter>{children}</BrowserRouter>;
}
