import type { FC } from '@vez/ignis';
import { MainLayout } from '../layouts/main.layout';

export const AboutPage: FC = () => {
  return (
    <MainLayout title="About" description="Learn more about Ignis Framework">
      <h2>About Ignis Framework</h2>
      <p>
        Ignis is a modular, extensible backend framework for TypeScript built on{' '}
        <strong>Hono</strong>.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h3>Key Features</h3>
        <ul>
          <li>
            <strong>Dependency Injection:</strong> Custom lightweight DI container for
            loose coupling
          </li>
          <li>
            <strong>Component-Based Architecture:</strong> Reusable feature modules (Auth,
            Swagger, Socket.IO, etc.)
          </li>
          <li>
            <strong>Decorators:</strong> <code>@controller</code>, <code>@inject</code>,{' '}
            <code>@model</code> for metadata and routing
          </li>
          <li>
            <strong>Layered Architecture:</strong> Controllers → Services → Repositories →
            DataSources
          </li>
          <li>
            <strong>OpenAPI First:</strong> Automatic API documentation generation
          </li>
          <li>
            <strong>JSX Support:</strong> Server-side rendering with Hono JSX (NEW!)
          </li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h3>Architecture</h3>
        <p>
          Ignis follows a <strong>clean architecture</strong> approach with clear
          separation of concerns:
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
          }}
        >
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#3498db',
              color: 'white',
              borderRadius: '6px',
            }}
          >
            <h4 style={{ marginTop: 0 }}>Controllers</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              Handle HTTP requests, define routes, return responses
            </p>
          </div>
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#2ecc71',
              color: 'white',
              borderRadius: '6px',
            }}
          >
            <h4 style={{ marginTop: 0 }}>Services</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              Implement business logic, coordinate repository calls
            </p>
          </div>
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#e74c3c',
              color: 'white',
              borderRadius: '6px',
            }}
          >
            <h4 style={{ marginTop: 0 }}>Repositories</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: 0 }}>
              Abstract data access, interact with DataSources
            </p>
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#fff3cd',
          borderRadius: '6px',
        }}
      >
        <h3>Learn More</h3>
        <p>
          Check out the{' '}
          <a href="/doc/explorer" style={{ color: '#856404' }}>
            API Documentation
          </a>{' '}
          to explore available endpoints and schemas.
        </p>
      </section>
    </MainLayout>
  );
};
