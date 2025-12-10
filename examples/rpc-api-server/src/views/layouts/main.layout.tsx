import type { FC, PropsWithChildren } from '@venizia/ignis';

interface MainLayoutProps {
  title: string;
  description?: string;
}

export const MainLayout: FC<PropsWithChildren<MainLayoutProps>> = props => {
  const { title, description, children } = props;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} | Ignis Example</title>
        {description && <meta name="description" content={description} />}
        <style>{`
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background-color: #f5f5f5;
            color: #333;
          }
          header {
            background-color: #fff;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
          }
          header h1 {
            margin: 0;
            color: #2c3e50;
          }
          nav {
            margin-top: 1rem;
          }
          nav a {
            color: #3498db;
            text-decoration: none;
            margin-right: 1.5rem;
            font-weight: 500;
          }
          nav a:hover {
            text-decoration: underline;
          }
          main {
            background-color: #fff;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            min-height: 400px;
          }
          footer {
            text-align: center;
            margin-top: 2rem;
            padding: 1rem;
            color: #7f8c8d;
            font-size: 0.9rem;
          }
          .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background-color: #3498db;
            color: white;
            border-radius: 4px;
            font-size: 0.85rem;
            margin-left: 0.5rem;
          }
        `}</style>
      </head>
      <body>
        <header>
          <h1>
            Ignis Framework <span class="badge">JSX SSR</span>
          </h1>
          <nav>
            <a href="/v1/api">Home</a>
            <a href="/v1/api/about">About</a>
            <a href="/v1/api/health-check">API Health</a>
            <a href="/v1/api/doc/explorer">API Docs</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>
            Powered by <strong>Ignis</strong> + <strong>Hono JSX</strong> | Server-Side
            Rendering
          </p>
        </footer>
      </body>
    </html>
  );
};