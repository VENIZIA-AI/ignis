# See Also

Categorized links at the bottom of every helper doc.

## Structure

```markdown
## See Also

- **Related Concepts:**
  - [Guide Name](/guides/path) - Brief relevance note

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Related Helper](./slug) - Brief relevance note

- **Components:**
  - [Related Component](/references/components/slug) - If helper has a component

- **External Resources:**
  - [Library Docs](https://example.com) - Underlying library documentation

- **Best Practices:**
  - [Guide Name](/best-practices/slug) - Brief relevance note
```

## Rules

- Use **categorized bullets** with bold category labels
- Each link gets a brief relevance note after the `-`
- Include only categories that have relevant links — don't add empty categories
- **Other Helpers: Index** is always included

## Common Categories

| Category | When to Include |
|----------|----------------|
| **Related Concepts** | Always — link to relevant guides |
| **Other Helpers** | Always — at minimum the index; add cross-references |
| **Components** | When the helper has a corresponding core component |
| **External Resources** | When the helper wraps a third-party library |
| **Best Practices** | When there's a relevant best practices page |

## Example

From the Redis helper:

```markdown
- **Related Concepts:**
  - [Services](/guides/core-concepts/services) - Using Redis in services

- **Other Helpers:**
  - [Helpers Index](./index) - All available helpers
  - [Queue Helper](./queue) - BullMQ uses Redis as backend

- **External Resources:**
  - [ioredis Documentation](https://github.com/redis/ioredis) - Redis client library
  - [Redis Commands](https://redis.io/commands/) - Command reference

- **Best Practices:**
  - [Performance Optimization](/best-practices/performance-optimization) - Caching strategies
```
