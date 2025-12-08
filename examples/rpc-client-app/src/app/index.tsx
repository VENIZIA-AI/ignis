import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/widgets";
import { Spin } from "antd";

const HomePage = lazy(() =>
  import("@/features/home").then((m) => ({ default: m.HomePage })),
);
const AboutContent = lazy(() =>
  import("@/features/about").then((m) => ({ default: m.AboutContent })),
);
const SignUpForm = lazy(() =>
  import("@/features/auth").then((m) => ({ default: m.SignUpForm })),
);
const LoginForm = lazy(() =>
  import("@/features/auth").then((m) => ({ default: m.LoginForm })),
);

function LoadingFallback() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Spin size="large" tip="Loading..." />
    </div>
  );
}

/**
 * Main application component
 * Configures routing with Holy Grail layout and lazy-loaded routes
 */
export function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutContent />} />
          <Route path="sign-up" element={<SignUpForm />} />
          <Route path="login" element={<LoginForm />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
