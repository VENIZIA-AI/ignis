---
title: The upload route removes its spool files on every exit and limits the number of file parts
description: "A rejected upload no longer leaves disk-spooled files behind, and one upload request carries at most 20 file parts by default (parseMultipartBody.maxFiles). A multipart parse that fails part-way removes what it wrote."
packages: ['@venizia/ignis-helpers', '@venizia/ignis']
---

# Changelog - 2026-11-06

## The upload route removes its spool files on every exit and limits the number of file parts

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** With `parseMultipartBody.storage: 'disk'`, an upload that was refused for its folder path or depth left its spool files in `uploadDir`, and nothing limited how many file parts a request carried. Both are fixed.

## What changed

- **Cleanup on every exit.** The spool files are removed whether the upload succeeds or fails, including a refusal for the folder path, the folder depth or the size.
- **A part limit.** One upload request may carry at most 20 file parts by default. More is refused with `413` before any file is written. Set `parseMultipartBody.maxFiles` on the controller to change it.
- **Its own error code.** The refusal is `core.request.too_many_files` (413). A `maxFiles` that is not a non-negative integer is a configuration error, not a silent no-limit.
- **A failing parse cleans up.** `RequestUtility.parseMultipartBody` removes the files it spooled when it fails part-way (a write that dies midway included, and one file that cannot be removed does not stop the others), and takes an optional `maxFiles` of its own (unset: no limit, as before).

## Who is affected

- **Apps that upload more than 20 files in one request.** Raise `parseMultipartBody.maxFiles`.
- **Apps using `storage: 'disk'`.** Rejected uploads no longer fill `uploadDir`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/utilities/request.utility.ts` | helpers |
| `src/components/static-asset/controller/factory.ts` | core-server |
| `src/components/static-asset/common/{constants,types}.ts` | core-server |
