import type { VulcanConfig } from '@venizia/vulcan';

export const check = {
  // Values `vulcan doctor` reads as private that are not: placeholders and examples the docs and sources show on purpose.
  doctor: {
    privateValues: {
      acknowledged: [
        {
          path: 'docs/wiki/content/**',
          types: ['url-credentials'],
          reason:
            'Wiki examples: placeholder connection strings (user:password@host) in a datasource, queue or environment sample.',
        },
        {
          path: '{docs/wiki/content/best-practices/troubleshooting-tips.md,docs/wiki/content/changelogs/2026-01-06-basic-authentication.md,docs/wiki/content/extensions/components/authentication/errors.md,docs/wiki/content/references/configuration/environment-variables.md}',
          types: ['token'],
          reason:
            'Wiki examples: the word Bearer or Basic in an auth header sample, and the AWS documentation example key.',
        },
        {
          path: 'docs/wiki/content/**',
          types: ['ipv4'],
          reason:
            'Wiki examples whose subject is a private, link-local or multicast address: the JWKS host allow-list, the URL-safety guard (the cloud metadata address), a Docker link, a UDP multicast group. The dated changelog entries are history and keep the addresses they were published with.',
        },
        {
          path: 'packages/helpers/src/common/redact.ts',
          types: ['url-credentials'],
          reason: 'The redaction helper documents the user:password@host shape it removes.',
        },
        {
          path: '{packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts,packages/helpers/src/modules/storage/bun-s3/utility.ts}',
          types: ['token'],
          reason:
            'Code that names the Bearer scheme and builds an Authorization header from a variable; no literal credential.',
        },
        {
          path: '{packages/core-server/src/components/auth/authenticate/services/jwks-url-policy.ts,packages/helpers/src/modules/network/utilities/url-safety/common/types.ts,packages/helpers/src/modules/network/utilities/url-safety/policy.ts,packages/kernel/src/base/auth/authenticate/common/types/jwt.ts,packages/core-server/src/base/applications/server.ts}',
          types: ['ipv4'],
          reason:
            'The JWKS host policy and the URL-safety guard name the private and link-local addresses they refuse, and the server comment shows the Docker container-link form it ignores.',
        },
        {
          path: '{examples/supabase/.env.example,examples/supabase/src/common/environments.ts,examples/vert/src/datasources/postgres.datasource.ts}',
          types: ['url-credentials'],
          reason:
            'Example apps: the local Docker connection string (postgres:postgres@localhost) and the template that builds one from its parts.',
        },
        {
          path: '{presets/app/files/.configs/builders/Dockerfile,scripts/preset/preset-smoke.ts}',
          types: ['machine-path'],
          reason:
            'The home folder of the bun user inside the container image, not a developer machine.',
        },
      ],
    },
  },
} satisfies VulcanConfig.Check;
