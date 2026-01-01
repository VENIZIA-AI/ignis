# Pattern Matching Operators

Operators for string pattern matching and regular expressions.


## like - Pattern Matching (Case-Sensitive)

Matches strings using SQL LIKE patterns.

```typescript
// Starts with
{ where: { email: { like: '%@gmail.com' } } }
// SQL: WHERE "email" LIKE '%@gmail.com'

// Contains
{ where: { name: { like: '%john%' } } }
// SQL: WHERE "name" LIKE '%john%'

// Ends with
{ where: { filename: { like: '%.pdf' } } }
// SQL: WHERE "filename" LIKE '%.pdf'

// Single character wildcard
{ where: { code: { like: 'A_B' } } }  // Matches 'A1B', 'AXB', etc.
// SQL: WHERE "code" LIKE 'A_B'
```

**Pattern Characters:**
- `%` - Matches any sequence of characters (including empty)
- `_` - Matches exactly one character


## nlike - Not Like

```typescript
{ where: { email: { nlike: '%@test.com' } } }
// SQL: WHERE "email" NOT LIKE '%@test.com'
```


## ilike - Case-Insensitive Pattern Matching

PostgreSQL-specific case-insensitive LIKE.

```typescript
{ where: { name: { ilike: '%john%' } } }
// SQL: WHERE "name" ILIKE '%john%'
// Matches: 'John', 'JOHN', 'john', 'JoHn'

{ where: { email: { ilike: '%@GMAIL.COM' } } }
// Matches: 'user@gmail.com', 'USER@Gmail.Com'
```


## nilike - Not ILike

```typescript
{ where: { email: { nilike: '%@example%' } } }
// SQL: WHERE NOT ("email" ILIKE '%@example%')
```


## regexp - Regular Expression (Case-Sensitive)

PostgreSQL POSIX regex matching.

```typescript
// Starts with letter
{ where: { code: { regexp: '^[A-Z]' } } }
// SQL: WHERE "code" ~ '^[A-Z]'

// Email pattern
{ where: { email: { regexp: '^[a-z]+@[a-z]+\\.[a-z]+$' } } }
// SQL: WHERE "email" ~ '^[a-z]+@[a-z]+\.[a-z]+$'

// Phone number pattern
{ where: { phone: { regexp: '^\\+?[0-9]{10,15}$' } } }
```

> [!NOTE]
> Escape backslashes in TypeScript strings: `\\d` for regex `\d`.


## iregexp - Case-Insensitive Regular Expression

```typescript
{ where: { name: { iregexp: '^john' } } }
// SQL: WHERE "name" ~* '^john'
// Matches: 'John Doe', 'JOHN SMITH', 'john'
```


## Summary

| Operator | SQL | Case | Description |
|----------|-----|------|-------------|
| `like` | `LIKE` | Sensitive | Pattern with wildcards |
| `nlike` | `NOT LIKE` | Sensitive | Negative pattern |
| `ilike` | `ILIKE` | Insensitive | PostgreSQL only |
| `nilike` | `NOT ILIKE` | Insensitive | PostgreSQL only |
| `regexp` | `~` | Sensitive | POSIX regex match |
| `iregexp` | `~*` | Insensitive | POSIX regex match |
