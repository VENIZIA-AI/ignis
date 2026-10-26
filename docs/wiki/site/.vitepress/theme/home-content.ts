/**
 * Every word of IGNIS's home page and footer. The structure, the design and the behaviour are the
 * shared layout (theme/shared); this file only says what it shows.
 *
 * COUNTS is what the page claims about the repository. A test of the wiki
 * (scripts/checks/__tests__/wiki-home-content.test.ts) counts the same things and fails when a number
 * here drifts, so update COUNTS and the test passes again.
 */
import pkg from '../../../../../packages/core-server/package.json';
import type { THomeContent, TSiteInfo } from './shared/home-types';

/** The data engines are the connector sub-paths that talk to a database or a search engine. */
export const ENGINES = ['./postgres', './sqlite', './typesense', './meilisearch'];
export const COUNTS = { packages: 9, engines: ENGINES.length };

export const SITE: TSiteInfo = {
  id: 'ignis',
  name: 'IGNIS',
  repo: 'https://github.com/VENIZIA-AI/ignis',
  npm: 'https://www.npmjs.com/package/@venizia/ignis',
  own: [
    ['Guide', '/guides/'],
    ['References', '/references/'],
    ['Extensions', '/extensions/'],
    ['Changelog', '/changelogs/'],
  ],
};

export const VERSION: string = pkg.version;

/** The release line, as the proof strip shows it: 0.4 for 0.4.5. */
export const RELEASE_LINE: string = VERSION.split('.').slice(0, 2).join('.');

const CONTROLLER_SAMPLE = `const UserCrud = ControllerFactory
  .defineCrudController({
    entity: User,
    repository: { name: UserRepository.name },
    controller: {
      name: 'UserController',
      basePath: '/users',
    },
  });

// Validated, in the OpenAPI docs. Open until
// you add authenticate and authorize.
@controller({ path: '/users' })
export class UserController extends UserCrud {}`;

export const HOME: THomeContent = {
  id: 'ignis',
  name: 'IGNIS',
  version: VERSION,
  eyebrow: `IGNIS ${VERSION} · MIT · Hono · Drizzle · Bun and Node`,
  title: [['Focus on business value.'], 'IGNIS holds the\u00A0discipline.'],
  lede: 'Controllers, services and repositories, connected by dependency injection. Validation and API docs come from the same code.',
  install: {
    label: 'Create a project',
    lines: ['bun x @venizia/vulcan init --preset ignis', 'cd my-product && make dev'],
  },
  cta: [
    ['5-Minute Quickstart', '/guides/get-started/5-minute-quickstart'],
    ['Read the docs', '/guides/'],
  ],
  tabs: [
    {
      file: 'user.controller.ts',
      kind: 'code',
      body: CONTROLLER_SAMPLE,
      note: 'Nine CRUD routes: find, findOne, findById, count, create, updateById, updateBy, deleteById, deleteBy. Imports left out. <a href="/guides/core-concepts/rest-controllers">REST controllers</a> explains the factory.',
    },
    {
      file: 'make dev',
      kind: 'term',
      body: [
        ['cmd', 'cd my-product && make dev'],
        ['c', '# the app serves under /api'],
        ['c', '# http://localhost:3000/api/hello       answers {"message":"Hello from IGNIS!"}'],
        ['c', '# http://localhost:3000/api/doc/explorer the API reference'],
      ],
      note: 'The two endpoints of the <a href="/guides/get-started/5-minute-quickstart">quickstart</a>.',
    },
  ],
  stats: [
    [String(COUNTS.packages), 'packages'],
    [String(COUNTS.engines), 'data engines'],
    [RELEASE_LINE, 'release line, pre-1.0'],
  ],
  footnote:
    'Counted from the repository. A test of the wiki fails when the numbers it states drift from it.',
  featuresTitle: 'What it offers today',
  featuresLede: 'Eight parts, one structure.',
  cells: [
    {
      name: 'hono',
      title: 'Built on Hono',
      text: "Controllers wrap Hono's OpenAPIHono directly, with no adapter layer. Routes are typed with @hono/zod-openapi, and Swagger or Scalar docs come from your schemas.",
      href: '/guides/core-concepts/rest-controllers',
    },
    {
      name: 'di',
      title: 'Decorator DI',
      text: 'A small standalone container. @inject, @controller and @repository with auto-wiring and singleton or transient scopes.',
      href: '/guides/core-concepts/dependency-injection',
    },
    {
      name: 'data',
      title: 'Type-safe data',
      text: 'Drizzle and Zod end to end. A repository hierarchy with relations, transactions, soft delete and a rich filter system.',
      href: '/guides/core-concepts/persistent/',
    },
    {
      name: 'auth',
      title: 'Authentication',
      text: 'One component for JWT (JWS or JWKS), Basic and service-assertion authentication. Casbin authorization is experimental. OAuth2 is not implemented: its hook is an empty stub.',
      href: '/extensions/components/authentication/',
      chip: ['OAuth2 not implemented', 'no'],
    },
    {
      name: 'realtime',
      title: 'Real-time and jobs',
      text: 'WebSocket, Socket.IO and Mail components; BullMQ, Kafka, MQTT, Redis and Cron helpers. Import each from its sub-path.',
      href: '/extensions/components/websocket/',
    },
    {
      name: 'tenancy',
      title: 'Multi-tenant by design',
      text: 'A row access scope with a write guard, default query filters and limits per model, and CRUD controllers that refuse to boot when a write route would inherit a read-only authorize.',
      href: '/guides/core-concepts/persistent/model-settings',
    },
    {
      name: 'engines',
      title: 'One contract, several engines',
      text: 'PostgreSQL (three drivers, PGlite included), SQLite, Typesense and Meilisearch behind the same repository contract, plus an HTTP connector for the browser side.',
      href: '/references/base/connectors',
    },
    {
      name: 'browser',
      title: 'Runs in a browser or Worker',
      text: 'The kernel, filter, inversion and worker packages bundle for a browser or Web Worker with plain vite build, and a CI gate keeps Node builtins out.',
      href: '/guides/core-concepts/browser-and-web-worker',
    },
  ],
  stepsTitle: 'Three steps to start.',
  steps: [
    {
      title: 'Create',
      text: 'One command writes a monorepo with a first controller, tests and the files of your coding agents.',
      lines: [
        ['cmd', 'bun x @venizia/vulcan init --preset ignis'],
        ['c', '# it asks four names: the project, the backend folder,'],
        ['c', '# the app and the shared code folder'],
      ],
    },
    {
      title: 'Run',
      text: 'Start the dev server and open the API reference.',
      lines: [
        ['cmd', 'cd my-product && make dev'],
        ['c', '# http://localhost:3000/api/doc/explorer'],
      ],
    },
    {
      title: 'Grow',
      text: 'Add another app or a library to the same monorepo.',
      lines: [['cmd', 'bun x --no-install vulcan add --preset ignis --lib billing --dir libs']],
    },
  ],
  fitUse: [
    'Growing APIs (10+ endpoints) that need real structure',
    'Teams who want DI, repositories and testability',
    'Services on Bun or Node with clear layers',
    'PostgreSQL or SQLite with Drizzle, typed from model to route',
  ],
  fitNot: [
    'A 3-route microservice: plain Hono is enough',
    'A GraphQL-first stack',
    'A requirement for an ORM other than Drizzle',
    'A large plugin marketplace today',
    'A 1.0 API promise: on the 0.4 line a patch release can carry a breaking change',
  ],
  maturityHtml:
    '<b>On the 0.4 line.</b> The APIs still change between releases, and every release is a patch release, breaking ones included. Each <a href="/changelogs/">changelog</a> entry says who is affected and what to do.',
  builtOn: ['Hono', 'Drizzle', 'Zod', 'TypeScript', 'Bun and Node'],
  closing: {
    title: 'Start with one endpoint. Keep the order as it\u00A0grows.',
    text: 'The quickstart creates a project with a first endpoint in two commands.',
  },
};
