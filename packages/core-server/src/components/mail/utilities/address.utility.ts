/**
 * Splits one or more RFC 5322 mailbox strings into individual addresses. A caller-supplied `to`
 * is frequently a single comma-separated string (`"a@x.com, b@y.com"`), not an array - treating
 * it as one opaque address turns it into a single malformed recipient. Splitting only at
 * top-level commas (outside a quoted display name) keeps `"Doe, Jane" <jane@x.com>` intact while
 * still separating `"Doe, Jane" <jane@x.com>, bob@y.com` into its two mailboxes.
 */
export function splitAddressList(value: string | string[]): string[] {
  const items = Array.isArray(value) ? value : [value];
  const addresses: string[] = [];

  for (const item of items) {
    let current = '';
    let inQuotes = false;

    for (const char of item) {
      if (char === '"') {
        inQuotes = !inQuotes;
      }

      if (char === ',' && !inQuotes) {
        if (current.trim()) {
          addresses.push(current.trim());
        }
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      addresses.push(current.trim());
    }
  }

  return addresses;
}
