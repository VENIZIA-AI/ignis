import type { FC } from '@venizia/ignis';
import { MainLayout } from '../layouts/main.layout';

interface HomePageProps {
  timestamp?: string;
}

export const HomePage: FC<HomePageProps> = props => {
  const { timestamp } = props;

  return (
    <MainLayout title="Home" description="Welcome to Ignis Framework with JSX SSR">
      <h2>Welcome to Ignis Framework!</h2>
      <p>
        This page is rendered using <strong>server-side JSX</strong> with Hono's built-in
        JSX support.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h3>Features</h3>
        <ul>
          <li>
            <strong>Server-Side Rendering:</strong> JSX components rendered to HTML on the
            server
          </li>
          <li>
            <strong>Type-Safe:</strong> Full TypeScript support with proper type inference
          </li>
          <li>
            <strong>Component-Based:</strong> Reusable layouts and components
          </li>
          <li>
            <strong>Hono Integration:</strong> Leverages Hono's native JSX support
          </li>
          <li>
            <strong>OpenAPI Documented:</strong> HTML routes appear in your API
            documentation
          </li>
        </ul>
      </section>

      <section
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#ecf0f1',
          borderRadius: '6px',
        }}
      >
        <h3>Getting Started</h3>
        <p>Create a controller with JSX routes:</p>
        <pre
          style={{
            backgroundColor: '#2c3e50',
            color: '#ecf0f1',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
          }}
        >
          {`this.defineJSXRoute({
  configs: {
    path: '/',
    method: 'get',
    description: 'Home page',
  },
  handler: (c) => <HomePage />
});`}
        </pre>
      </section>

      {timestamp && (
        <section style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#7f8c8d' }}>
          <p>Page rendered at: {timestamp}</p>
        </section>
      )}
    </MainLayout>
  );
};