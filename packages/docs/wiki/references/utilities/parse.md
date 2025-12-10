# Parse Utility

The Parse utility provides a collection of functions for data type checking, conversion, and transformation.

## Type Checking

-   **`isInt(n)`**: Checks if a value is an integer.
-   **`isFloat(n)`**: Checks if a value is a float.

## Type Conversion

-   **`int(input)`**: Parses a value to an integer. Handles string with commas and defaults to `0` if the input is invalid.
-   **`float(input, digit = 2)`**: Parses a value to a float, rounding to a specified number of digits. Handles string with commas and defaults to `0` if the input is invalid.
-   **`toBoolean(input)`**: Converts various string/number representations (e.g., `'true'`, `'1'`, `1`) to a boolean.
-   **`toStringDecimal(input, digit = 2)`**: Formats a number to a string with a specified number of decimal places, using locale-specific formatting.

```typescript
import { int, float, toBoolean } from '@venizia/ignis';

const myInt = int('1,000'); // => 1000
const myFloat = float('1,234.567', 2); // => 1234.57
const myBool = toBoolean('true'); // => true
```

## String and Object Transformation

-   **`toCamel(s)`**: Converts a string from snake_case or kebab-case to camelCase.
-   **`keysToCamel(object)`**: Recursively converts all keys in an object (and nested objects) to camelCase.

```typescript
import { toCamel, keysToCamel } from '@venizia/ignis';

const camelString = toCamel('my-snake_case-string');
// => 'mySnakeCaseString'

const camelObject = keysToCamel({ 'first-name': 'John', 'last_name': 'Doe' });
// => { firstName: 'John', lastName: 'Doe' }
```

## Array Transformation

-   **`parseArrayToRecordWithKey(opts)`**: Transforms an array of objects into a record (plain object), using a specified property of the objects as keys.
-   **`parseArrayToMapWithKey(arr, keyMap)`**: Transforms an array of objects into a `Map`, using a specified property of the objects as keys. This is useful for efficient lookups.

```typescript
import { parseArrayToMapWithKey } from '@venizia/ignis';

const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

const usersMap = parseArrayToMapWithKey(users, 'id');
// => Map { 1 => { id: 1, name: 'Alice' }, 2 => { id: 2, name: 'Bob' } }

const user = usersMap.get(1);
// => { id: 1, name: 'Alice' }
```

## Unique ID

-   **`getUID()`**: Generates a simple, short unique ID string.

```typescript
import { getUID } from '@venizia/ignis';

const uniqueId = getUID(); // => e.g., 'A1B2C3D4'
```
