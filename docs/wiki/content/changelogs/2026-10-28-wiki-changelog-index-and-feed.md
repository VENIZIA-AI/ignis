---
title: The changelog has an index you can filter, and an RSS feed
description: "The IGNIS wiki changelog is now a filterable index of every entry, written from the entry files themselves, with an RSS feed at /changelog.xml. The same index the VULCAN and ARDOR wikis have."
packages: []
---

# Changelog - 2026-10-28

## The changelog has an index you can filter, and an RSS feed

<Badge type="tip" text="Enhancement" />

**In one line.** The wiki's changelog page lists every entry from its own file, with a latest entry on top and filters by kind, and the site publishes an RSS feed of them. Wiki only; no package changes.

## What changed

- **The index is built from the entries.** The page reads each entry's date (from its file name), title, summary, packages and badge, so a new entry shows up the moment its file exists. The hand-kept table and the changelog menu are gone; an entry no longer needs a row or a menu link.
- **Filters.** All, Releases, Features, Fixes, Security and Breaking, with the number of entries shown.
- **An RSS feed.** `/changelog.xml`, one item per entry, linked from every page's head.
- **Entry pages** open with a link back to the index, the date, the kind and the packages the entry covers.

## Who is affected

Readers only. An author writes the entry file with its `title`, `description`, `packages:` list and badge line, as before; nothing else is needed.
