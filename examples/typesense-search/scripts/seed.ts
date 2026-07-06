/**
 * Seeds sample articles through ArticleRepository - not a raw driver import - so hiddenProperties/
 * defaultFilter/schema provisioning all go through the same code path the running app uses.
 *
 * Run from examples/typesense-search (after `docker compose up` and `bun install`):
 *   NODE_ENV=development bun run seed
 */
import { SearchDataSource } from '@/datasources';
import { TArticleDocument } from '@/models/entities';
import { ArticleRepository } from '@/repositories';
import { LoggerFactory } from '@venizia/ignis-helpers';

const logger = LoggerFactory.getLogger(['seed']);

const now = Date.now();
const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000;

const articles: TArticleDocument[] = [
  {
    id: 'article-1',
    title: 'Getting Started with TypeScript',
    content:
      'TypeScript adds static typing on top of JavaScript, catching whole classes of bugs before runtime.',
    category: 'programming',
    status: 'published',
    views: 1204,
    publishedAt: daysAgo(30),
    tags: ['typescript', 'javascript'],
  },
  {
    id: 'article-2',
    title: 'Designing REST APIs with Hono',
    content:
      'Hono is a small, fast web framework that runs on Bun, Node, Deno, and edge runtimes alike.',
    category: 'programming',
    status: 'published',
    views: 892,
    publishedAt: daysAgo(21),
    tags: ['hono', 'rest-api'],
  },
  {
    id: 'article-3',
    title: 'PostgreSQL Indexing Strategies',
    content:
      'Choosing the right index type - B-tree, GIN, GiST - has an outsized effect on query latency.',
    category: 'databases',
    status: 'published',
    views: 2350,
    publishedAt: daysAgo(45),
    tags: ['postgres', 'performance'],
  },
  {
    id: 'article-4',
    title: 'A Typesense Primer',
    content:
      'Typesense is a typo-tolerant search engine built for instant, relevant full-text search.',
    category: 'databases',
    status: 'published',
    views: 640,
    publishedAt: daysAgo(10),
    tags: ['typesense', 'search'],
  },
  {
    id: 'article-5',
    title: 'Zero-Downtime Deploys with Docker Compose',
    content: 'Rolling restarts and health checks let you ship without dropping in-flight requests.',
    category: 'devops',
    status: 'published',
    views: 431,
    publishedAt: daysAgo(5),
    tags: ['docker', 'devops'],
  },
  {
    id: 'article-6',
    title: 'Reading a Job Offer Like an Engineer',
    content:
      'Total comp, vesting cliffs, and refresh grants matter as much as the base salary line.',
    category: 'career',
    status: 'published',
    views: 3012,
    publishedAt: daysAgo(60),
    tags: ['career'],
  },
  {
    id: 'article-7',
    title: 'Draft: Event Sourcing Notes (unfinished)',
    content: 'Work-in-progress notes on append-only event logs and projection rebuilding.',
    category: 'programming',
    status: 'draft',
    views: 0,
    publishedAt: daysAgo(1),
    internalNote: 'Needs a diagram before this goes out - ping design team.',
  },
  {
    id: 'article-8',
    title: 'Archived: Our 2024 Roadmap',
    content: 'Superseded by the 2026 roadmap - kept for historical reference only.',
    category: 'company',
    status: 'archived',
    views: 58,
    publishedAt: daysAgo(400),
  },
];

const seed = async () => {
  // Same SearchDataSource the app boots with - configure() discovers the ArticleDocument
  // collection from ArticleRepository's @repository binding and provisions it (additive-only).
  const dataSource = new SearchDataSource();
  await dataSource.configure();

  const repository = new ArticleRepository(dataSource);

  // article-7 (draft) and article-8 (archived) are excluded from the @model defaultFilter
  // (status: published), so writing them still succeeds - only reads are filtered.
  const { count } = await repository.createAll({ data: articles });

  logger
    .for('seed')
    .info('Seeded %d article(s) | collection: %s', count, repository.collectionName);
};

seed()
  .then(() => process.exit(0))
  .catch(error => {
    logger.for('seed').error('Seeding failed | error: %s', error);
    process.exit(1);
  });
