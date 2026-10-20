import type { FC, PropsWithChildren } from 'hono/jsx';

export const MainLayout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title} | IGNIS</title>
      <style>
        {'body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; }'}
      </style>
    </head>
    <body>
      <nav>
        <a href="/api">Home</a> | <a href="/api/about">About</a> |{' '}
        <a href="/api/doc/explorer">API explorer</a>
      </nav>
      <main>{children}</main>
    </body>
  </html>
);
