---
title: The upload-policy request bounds the number of files
description: "The files array of the upload-policy body accepts at most parseMultipartBody.maxFiles entries (default 20); more is a 422."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-06

## The upload-policy request bounds the number of files

<Badge type="danger" text="Security" /> <Badge type="info" text="Bug Fix" />

**In one line.** `POST .../upload-policy` signed one policy per entry of `files`, with no limit on the array. It is capped now.

## What changed

- **A limit.** The `files` array accepts at most `parseMultipartBody.maxFiles` entries, `20` unless set. More is refused with `422` before the storage is asked for any policy. The same option already bounds the multipart upload route.
- **Nothing else changes.** Up to the limit the response is the same.

## Who is affected

- **Clients that ask for more than 20 policies in one request.** Split the request, or raise `parseMultipartBody.maxFiles`.
- **Everyone else.** No action needed.

## Details

| File | Package |
|------|---------|
| `src/components/static-asset/controller/base.definition.ts` | core-server |
| `src/components/static-asset/controller/factory.ts` | core-server |
