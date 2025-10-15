---
applyTo: '**'
---
# Copilot / Assistant Instructions for the web-buddy repository

Purpose
-------
This file is a short, practical guide for an AI coding assistant (Copilot-like) working on the Web Buddy repository. Use it to keep suggestions, code style, naming, and tests consistent with the project's conventions and the maintainer's intent.

High-level vibe
----------------
- Practical, conservative, and safety-first. Prefer small, well-tested changes over sweeping rewrites.
- MV3-first: prefer Manifest V3 service-worker entrypoints as the primary runtime. Keep MV2 artifacts only temporarily during a staged migration with tests and a rollback plan.
- Explicit about assumptions: when taking guesswork, call out assumptions in the PR description.

Important policy for integrations, errors, and testing
---------------------------------------------------
- No silent fallbacks: code must not rely on implicit or silent runtime fallbacks to hide missing integrations or degraded behaviour. If an integration (browser API, external service, or runtime capability) is required, code should detect its availability explicitly and fail fast with a clear, actionable error message or a documented migration/compatibility path.
- Do not swallow errors: avoid catch-all handlers that suppress exceptions or drop errors without logging or rethrowing. Use explicit error handling, log a concise diagnostic (use existing debug helpers like `bgDebug` where appropriate), and surface failures to the caller or persistent diagnostics so they can be observed in tests and telemetry.
- Real integrations in non-test code: production and integration code must rely on real platform/browser/service APIs. Do not include mocked implementations or "dev-only" fallbacks in source files. If a shim is necessary for portability, keep it tiny, well-documented, and gated behind an explicit feature-detection layer with clear unit tests explaining its purpose.
- Mocks only for unit tests: test suites may use mocks, stubs, or fakes, but only within unit tests. Unit tests must clearly document what is mocked and why. Integration tests and E2E tests must exercise as much of the real system as is practical (see E2E section below).

E2E and integration testing requirements
---------------------------------------
- Real E2E runs: end-to-end (E2E) and integration tests must use real browser runtimes and real external services where feasible. If an external dependency is expensive or unstable, prefer a verified local test harness or an official test instance rather than an in-code mock.
- Explicit test exceptions: if a dependency absolutely cannot be used in an E2E environment (for reasons outside the project's control), document the constraint in the test and the repository README, and file an issue documenting the planned mitigation. Prefer test skips that include a link to the issue instead of silently falling back to a fake.
- Test failure visibility: E2E failures should be visible and actionable. Avoid flapping tests caused by hidden fallbacks or flaky conditions introduced by stubs.

Coding conventions
------------------
- Language: ES5/ES6-style JavaScript. Files follow CommonJS for Node tooling (tests, build) and UMD-like patterns for browser globals.
- Modules: translators expose `translator` in CommonJS (`module.exports.translator`) and populate `translators.<name>` on the global in the browser. When adding a translator, follow that pattern.
- Exports and globals: prefer adding safe guards (try/catch) when accessing globals like `chrome`, `browser`, `translator`, or `MqttBridge`.
- Style: project uses ESLint with Airbnb base rules. Keep functions small and avoid deep nesting. Use explicit try/catch around runtime/browser APIs.
- Logging: use `bgDebug` or similar minimal debug wrappers when present. Avoid noisy console output in production code.

- Runtime API access: when calling browser or host APIs, perform explicit feature-detection and fail clearly if unavailable. Do not implement silent polyfills that change expected behaviour.

Translators (contract)
----------------------
When creating or modifying translators (under `src/translator/`), follow this contract:
- Provide both CommonJS and browser-global exports. Example pattern in existing translators:
  - In Node: `module.exports.translator = factory();`
  - In browser: `root.translators = root.translators || {}; root.translators.playwright = factory();`
- Implement two functions on the returned object:
  - `generateOutput(list)` — returns a string representation of the translation (used in UI previews).
  - `generateFile(list, maxLength, demo, verify, libSource)` — returns a full file/string to save.
- Keep the translators pure and defensive: validate input (arrays), use try/catch, and never throw uncaught errors.

-Background & content scripts
----------------------------
- Target MV3 as the primary runtime: `src/background-sw.js` should be the canonical background entrypoint. Avoid adding new MV2-only code.
- If MV2 artifacts exist (historic files or helpful references), keep them only as documentation references during migration. Remove them once MV3 parity is proven by tests and staged rollout.
- Use the existing `host` shim pattern when writing code meant to run in tests or Node (see `src/state.js`). This makes testing easier.
- Messaging: prefer safe send patterns (see `sendMessageWithHandshake` and `sendMessageToTabObj`). When adding message handlers, persist small debug traces in storage for observability.

Locator & classifier patterns
----------------------------
- Locator code tends to favor XPath for fidelity, with fallback heuristics (text, parent text, id/name/class).
- Keep classifier functions small and testable; return null for unsupported elements. When adding heuristics, add unit tests in `test/locator`.

Tests and quality gates
----------------------
- Tests: mocha + chai + jsdom. Tests live in `test/` and use `test/setup.js` to initialize environment.
- Lint: project uses ESLint. New JS should pass `npm run lint` (or `yarn lint`).
- Before proposing changes, implement at least one unit test for any new behavior (happy path and one edge case).

File and commit hygiene
-----------------------
- Keep changes focused and small. Each PR should have a single primary purpose.
- Update `package.json` only when necessary (adding devDependencies for tests, build scripts). Use existing Node engine (>=14).
- Use descriptive commit messages and include `Fixes #<issue>` when relevant.
 - Use descriptive commit messages and include a reference to the issue when relevant (for example: "Fixes issue 123").
 - Use descriptive commit messages and include a reference to the issue when relevant.

When to refactor
-----------------
- Refactor only when it reduces complexity and you can keep legacy compatibility or provide a migration path.
- For big migrations (MV2->MV3), create a plan in an issue, include tests, and stage the work across multiple PRs.

Examples — prompts for this repo
--------------------------------
- "Add a unit test for `classifier` to assert it returns {type:'text',value:...} for a textarea element and null for an input[type=hidden]. Use mocha+chai and jsdom." 
- "Create a new translator `src/translator/robot-translator.js` that implements `generateOutput` and `generateFile` for simple url/click/change actions. Follow existing playwright/cypress translator style and include two unit tests." 
- "Refactor `sendMessageWithHandshake` to extract a helper that persists benign errors. Keep behavior identical and add tests covering handshake success and benign failure." 

Edge cases to consider
---------------------
- Missing or undefined browser APIs in tests (use `host` shim pattern).
- Runtime.sendMessage lastError messages — treat some as benign and non-blocking.
- Translators receiving empty or malformed action lists.

Prompt templates for commit messages and PR descriptions
-----------------------------------------------------
- Commit subject (50 chars max): "<area>: short description"
  - e.g. "translator: add playwright locator escape helper"
- PR body must include:
  - What changed and why (1-2 paragraphs).
  - Tests added/updated.
  - Migration notes (if applicable).

Quick checklist (before opening PR)
---------------------------------
- [ ] Lint passes: `npm run lint` (or `yarn lint`)
- [ ] Unit tests added/updated and passing: `npm run test-local`
- [ ] Changes small, focused, and backwards-compatible
- [ ] README or docs updated when UX changes

Small, helpful additions you can make proactively
-------------------------------------------------
- Add unit tests for complex heuristics (locator/classifier/translator).
- Add JSDoc-style comments on exported functions.
- Add small integration tests that exercise translator output shape.

Prefer simple, durable solutions
-------------------------------
- Prefer small, simple, and durable solutions over complex or fragile fixes. When adding features or shims, favor approaches that are easy to maintain and reason about across browser versions and environments. Avoid clever one-off hacks that are hard to test or likely to break with minor platform changes.
- If a decision trades short-term convenience for long-term maintenance risk, document the trade-off in the PR and include a follow-up issue to revisit or harden the change.

Where to ask questions
----------------------
- Open an issue describing the ambiguity and link to the PR if the change depends on a design choice.

Closing note
------------
This file is a living document. If you find recurring patterns or rules not captured here, add them with a short rationale and an example.
