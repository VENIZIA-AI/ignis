import type { FC } from 'hono/jsx';
import { MainLayout } from '../layouts/main.layout';

export const AboutPage: FC = () => (
  <MainLayout title="About">
    <h1>About</h1>
    <p>
      A controller route answers HTML when its handler returns{' '}
      <code>context.html(&lt;Page /&gt;)</code>. The pages live in <code>src/views</code>; the route
      is declared with <code>defineJSXRoute</code>.
    </p>
  </MainLayout>
);
