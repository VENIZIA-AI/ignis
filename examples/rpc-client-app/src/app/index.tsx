import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/widgets";
import { HomePage } from "@/features/home";
import { AboutContent } from "@/features/about";
import { SignUpForm, LoginForm } from "@/features/auth";

/**
 * Main application component
 * Configures routing with Holy Grail layout
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutContent />} />
        <Route path="sign-up" element={<SignUpForm />} />
        <Route path="login" element={<LoginForm />} />
      </Route>
    </Routes>
  );
}
