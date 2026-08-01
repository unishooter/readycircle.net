# 10. Hybrid AI plan generation

## Status

Accepted

## Context

The plan engine foundation (ADR 0005) shipped tables (`plans`,
`plan_versions`, `plan_sections`) and worker job stubs, but nothing that
actually generated content. The product goal is a communications plan a
Circle coordinator can generate in one click: who is in the Circle and what
they can do (facts), plus a channel plan, role assignments, a check-in
schedule, and gap analysis (judgment calls that vary with each Circle's
capability mix, licensing, and geography).

Facts must never be wrong: a plan that misstates who has which radio, or
assigns a GMRS channel to an unlicensed station, is worse than no plan.
Large language models are good at the judgment-call sections and unreliable
at faithfully transcribing rosters.

## Decision

- **Hybrid generation.** The `overview` and `roster` sections are built
  deterministically from database queries -- no model involvement. Only the
  four advisory sections (`channel_plan`, `role_assignments`,
  `check_in_schedule`, `recommendations`) come from OpenAI, and the prompt
  receives the same assembled context the deterministic sections were built
  from, so the model cannot see (or leak) anything members could not.
- **Strict Structured Outputs.** The advisory response is constrained
  server-side (OpenAI `response_format` with a strict JSON schema derived
  from `planAdvisorySchema` in `packages/contracts`) and re-validated with
  Zod after parsing. Role assignments referencing stations that are not in
  the roster -- or receive-only stations -- are dropped
  (`validateAdvisoryStationRefs`); if nothing valid remains, the generation
  fails rather than persisting invented content.
- **`packages/plan-engine`** holds the whole pipeline (context builder,
  deterministic section builders, `AdvisoryProvider` interface + OpenAI
  implementation, PDF renderer, `DocumentStore`) so the worker (production,
  via SQS) and the API's in-process development fallback run *identical*
  code. The `AdvisoryProvider` interface is also the test seam: unit and
  integration tests use stub providers, never the network.
- **Async lifecycle on `plan_versions.status`:**
  `generating → draft | failed`, then `draft → published` (immutable per
  ADR 0005). The API creates the row and dispatches a job; the frontend
  polls. Generation failures are *recorded* (`status='failed'` +
  `error_message`) instead of thrown, so an SQS redelivery cannot re-burn a
  model call on a permanently bad input -- retry is an explicit user action
  (regenerate). The exact context used is snapshotted to
  `plan_versions.context_snapshot` for auditability.
- **JobDispatcher abstraction** in the API: SQS `sendMessage` when both
  queue URLs are configured, otherwise fire-and-forget in-process execution
  so local development works with no AWS resources at all.
- **PDF via `@react-pdf/renderer`** in the worker (pure JS, no headless
  browser on the EC2 box), stored through a `DocumentStore` interface: S3
  in production, a local directory (`DOCUMENT_STORAGE_PATH`, default
  `.data/documents`) in development. Downloads always stream through the
  authenticated `GET /plans/:planId/versions/:versionId/document` endpoint;
  the browser never touches S3. `plan_documents` tracks
  `pending | ready | failed` per version+format.
- **Model choice is configuration** (`OPENAI_MODEL`, default
  `gpt-5.6-terra`), not code. `OPENAI_API_KEY` is required at startup in
  production; in development a missing key simply makes generation fail
  with a clear user-visible message.

## Consequences

- Privacy shaping happens once, in the context builder: member locations
  are pre-shaped with the existing `shapeStationLocation` non-owner rules
  (coarse labels and 1km grid only, never coordinates), so the prompt, the
  stored snapshot, the rendered sections, and the PDF all inherit the same
  guarantee. Operator experience/authorization *are* included in the model
  context (a legal channel plan depends on licensing) but are excluded from
  the member-visible roster section.
- `openai`, `@react-pdf/renderer`, and `react` join `pino` in the apps'
  tsup `external` list (and as direct dependencies of `apps/api` and
  `apps/worker`): they do not survive being bundled into a single ESM file.
- `plans.created_by` and `plan_versions.created_by` became nullable with
  `ON DELETE SET NULL` (matching `circles.created_by`): a plan belongs to
  its Circle and must survive its creator's account deletion.
- The advisory quality depends on prompt + validation, not fine-tuning;
  regenerating is cheap and expected. Cost control is structural (one model
  call per explicit user action, never on a retry loop).
- Deploy checklist: add `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) to
  `/etc/readycircle/api.env` *and* `/etc/readycircle/worker.env`, and verify
  the `AWS_SQS_*_QUEUE_URL` values point at real queues the instance role
  can access -- if they are blank, the API transparently runs generation
  in-process, which works but does the AI + PDF work inside the API service.
