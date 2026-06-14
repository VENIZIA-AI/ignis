# Parse Utility

The Parse utility provides a collection of functions for data type checking, conversion, and transformation.

## Type Checking

-   **`isInt(n)`**: Checks if a value is an integer.
-   **`isFloat(n)`**: Checks if a value is a float.

## Type Conversion

-   **`int(input)`**: Parses a value to an integer. Handles strings with commas and defaults to `0` if the input is invalid.
-   **`float(input, digit = 2)`**: Parses a value to a float, rounding to a specified number of digits. Handles strings with commas and defaults to `0` if the input is invalid.
-   **`toBoolean(input)`**: Converts a value to a boolean. Returns `false` for empty string, `'false'`, `'0'`, `false`, `0`, `null`, and `undefined`. Returns `true` for everything else.
-   **`toStringDecimal(input, digit = 2, options?)`**: Formats a number to a string with a specified number of decimal places. By default uses locale-specific formatting (`useLocaleFormat: true`). When `useLocaleFormat` is `false`, uses `toFixed()` instead.

```typescript
import { int, float, toBoolean, toStringDecimal } from '@venizia/ignis-helpers';

const myInt = int('1,000'); // => 1000
const myFloat = float('1,234.567', 2); // => 1234.57
const myBool = toBoolean('true'); // => true
const formatted = toStringDecimal(1234.5, 2); // => '1,234.50'
const fixed = toStringDecimal(1234.5, 2, { useLocaleFormat: false }); // => '1234.50'
```

## String and Object Transformation

-   **`toCamel(s)`**: Converts a string from snake_case or kebab-case to camelCase.
-   **`keysToCamel(object)`**: Recursively converts all keys in an object (and nested objects) to camelCase.

```typescript
import { toCamel, keysToCamel } from '@venizia/ignis-helpers';

const camelString = toCamel('my-snake_case-string');
// => 'mySnakeCaseString'

const camelObject = keysToCamel({ 'first-name': 'John', 'last_name': 'Doe' });
// => { firstName: 'John', lastName: 'Doe' }
```

## Number Parsing

-   **`getNumberValue(input, opts?)`**: Parses a string to a number with locale support (US or EU format).

```typescript
import { getNumberValue } from '@venizia/ignis-helpers';

// US format (default) — comma is thousands separator
getNumberValue('1,234.56', { method: 'float' }); // => 1234.56
getNumberValue('1,234', { method: 'int' });       // => 1234

// EU format — dot is thousands separator, comma is decimal
getNumberValue('1.234,56', { method: 'float', locale: 'eu' }); // => 1234.56
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | `'int' \| 'float'` | `'int'` | Parse as integer or float |
| `locale` | `'us' \| 'eu'` | `'us'` | Number format locale |

## Array Transformation

-   **`parseArrayToRecordWithKey(opts)`**: Transforms an array of objects into a record (plain object), using a specified property of the objects as keys. Takes an options object with `arr` and `keyMap` properties. Throws an error if `keyMap` is not found in an element. Last element wins on duplicate keys.
-   **`parseArrayToMapWithKey(arr, keyMap)`**: Transforms an array of objects into a `Map`, using a specified property of the objects as keys. Takes positional arguments (not an options object). Throws an error if `keyMap` is not found in an element. Last element wins on duplicate keys.

```typescript
import { parseArrayToRecordWithKey, parseArrayToMapWithKey } from '@venizia/ignis-helpers';

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

// Record (options object pattern)
const usersRecord = parseArrayToRecordWithKey({ arr: users, keyMap: 'id' });
// => { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } }

// Map (positional arguments)
const usersMap = parseArrayToMapWithKey(users, 'id');
// => Map { 1 => { id: 1, name: 'Alice' }, 2 => { id: 2, name: 'Bob' } }

const user = usersMap.get(1);
// => { id: 1, name: 'Alice' }
```

## Unique ID

-   **`getUID()`**: Generates a simple, short unique ID string based on `Math.random()`, returned in uppercase.

```typescript
import { getUID } from '@venizia/ignis-helpers';

const uniqueId = getUID(); // => e.g., 'A1B2C3D4'
```
