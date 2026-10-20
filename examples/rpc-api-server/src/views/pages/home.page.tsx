import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.layout';

export const HomePage: FC = () => (
  <MainLayout title="Home">
    <h1>IGNIS RPC API server</h1>
    <p>
      This page is JSX rendered on the server. The same application serves a JSON API: sign up at{' '}
      <code>POST /api/auth/sign-up</code>, sign in at <code>POST /api/auth/sign-in</code>, then call{' '}
      <code>/api/configurations</code> with the token.
    </p>
  </MainLayout>
);
