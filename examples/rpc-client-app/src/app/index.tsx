import { AboutContent } from '@/features/about';
import { SignUpForm } from '@/features/auth';

/**
 * Main application component
 * Contains page layout and feature composition
 */
export function App() {
  return (
    <>
      <AboutContent />
      <SignUpForm />
      <p className="read-the-docs">
        Type-safe with openapi typescript + Ignis Framework
      </p>
    </>
  );
}
