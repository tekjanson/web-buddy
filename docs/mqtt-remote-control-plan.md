# MQTT Remote Control — Design & Implementation Plan

## Goal
Enable remote control of the Chrome extension over MQTT so external systems (CI, test runners, AI orchestrators) can:
- Request the current page HTML/DOM and receive it over MQTT.
- Send commands to the extension (clicks, fills, navigation, run arbitrary safe JS) and receive structured responses and events.
- Receive asynchronous events (console logs, network failures, screenshots, test failure diagnostics).

This allows building an independent, broker-based test controller that can integrate with any existing E2E framework and enable AI-driven investigation at failure points.

## Assumptions
- The extension will operate in Chromium-based browsers where content scripts can manipulate pages.
- An external MQTT broker will be available (self-hosted like Mosquitto, or cloud broker) with TLS support.
- The extension already has an MQTT integration (see `src/mqtt/` and `mqtt/bridge.js`). We'll reuse existing code where possible.
- Message payloads will be JSON (binary allowed for optimized artifacts like screenshots or gzipped HTML using Base64 or binary MQTT payloads if supported).

## High-level architecture

Components:
- Controller (external client) — sends commands, listens for responses/events.
- MQTT broker — transport layer.
- Extension background script — central MQTT client, subscribes to command topics and relays to the right extension context.
- Content scripts — execute DOM interactions and collect data (DOM snapshot, screenshots, clicks, forms).
- Command handlers — in content/background that validate and execute commands, produce responses and events.
- Offscreen worker (optional) — for tasks that need a DOM but no visible tab, or heavy processing.

Data flows:
1. Controller publishes command message to controller->extension topic (e.g., `webbuddy/<instance>/cmd/<target>`).
2. Background MQTT client receives and forwards to the appropriate tab/content script via messaging (chrome.tabs.sendMessage / runtime.sendMessage).
3. Content script runs the command (e.g., collect DOM or click) and posts result back to the background.
4. Background publishes response and any follow-up events to response topics.

## Topics & naming conventions
Design for multi-instance, multi-tab setups.

Base structure:
- Commands: webbuddy/<instance>/cmd/<clientId>/[requestId]
- Responses: webbuddy/<instance>/resp/<clientId>/[requestId]
- Events (async): webbuddy/<instance>/evt/<clientId>
- Broadcast commands (to any instance): webbuddy/broadcast/cmd/[...]

Fields:
- instance: logical environment (team/env name)
- clientId: the extension instance id — use chrome.runtime.id or a generated UUID persisted in storage
- requestId: unique id for correlating requests and responses

QoS and flags:
- Use QoS 1 for commands and responses to ensure delivery (or 2 if broker supports and needed).
- Do not retain command topics. Events may be retained only for last-known-state topics if useful.

Examples:
- Command to a specific extension instance: `webbuddy/ci-1/cmd/client-123/req-0001`
- Response: `webbuddy/ci-1/resp/client-123/req-0001`
- Events: `webbuddy/ci-1/evt/client-123`

## Message contracts
All payloads JSON with a top-level envelope. Versioning via `protocolVersion`.

Common envelope:
{
  "protocolVersion": "1.0",
  "requestId": "uuid-v4",
  "timestamp": 1697360000000,
  "type": "command|response|event",
  "action": "getDOM|click|fill|navigate|runScript|screenshot",
  "meta": { ... },
  "payload": { ... }
}

Command examples:
1) getDOM
{
  "requestId": "r1",
  "type": "command",
  "action": "getDOM",
  "payload": { "includeStyles": false, "maxSize": 1000000 }
}

2) click
{
  "requestId": "r2",
  "type": "command",
  "action": "click",
  "payload": { "selector": "#submit", "button": "left" }
}

Response example (success):
{
  "requestId": "r1",
  "type": "response",
  "status": "ok",
  "payload": { "html": "<html>...base64 or plain..." },
  "durationMs": 123
}

Error response example:
{
  "requestId": "r2",
  "type": "response",
  "status": "error",
  "error": { "code": "selector_not_found", "message": "Selector '#id' not found" }
}

Event example (console log):
{
  "type": "event",
  "eventType": "console",
  "payload": { "level": "error", "text": "Uncaught TypeError ..." }
}

Chunking and large payloads:
- For large HTML or screenshot payloads, either:
  - Use chunked messages with sequence numbers: payload contains `chunkIndex`, `chunkCount`, `data` (Base64). Use response topic to assemble.
  - Or upload artifact to an external storage (S3-like) and send a reference (signed URL). This is preferable for very large artifacts.

Versioning:
- Include `protocolVersion` and `action` version in messages. Commands should be ignored with a clear error if unsupported.

## Security model
- Use TLS between extension and broker. Require broker cert validation.
- Use authentication tokens: either username/password or token passed via extension settings. Tokens can be JWTs with scopes.
- Authorization: broker-side topic ACLs so controllers can only publish to topics they own. For multi-tenant, include `instance` in topic path.
- Confirm sensitive actions: by default, `runScript` and file downloads must be disabled or require a special allowlist in extension options.
- Allowlist/denylist: admin option in extension to decide which actions are permitted remotely.
- Logging and audit: publish events for accepted/denied commands for audit.

## Reliability and robustness
- Use MQTT QoS=1 for commands, responses.
- Implement request timeouts and retries on the controller side.
- Ensure idempotency where appropriate (click with requestId) — handlers should detect duplicate requestId and avoid repeating dangerous actions.
- Guard against slow or blocked tabs: background should detect if the tab disappears or message fails and return a suitable error.

## Implementation plan (MVP -> v1 -> extras)

MVP (basic control):
- Messages: `getDOM`, `click`, `fill`, `navigate`, `screenshot` (base64 PNG), `runScript` disabled or allowlist-only.
- Topics: per-instance/per-client as defined.
- Background MQTT client: subscribe to `webbuddy/<instance>/cmd/<clientId>/+` and bridge into extension messaging.
- Content script command handler: implement the command dispatcher and responders; implement DOM snapshotting with a size guard and optional gzipping.
- Basic auth: read broker credentials from extension options.

v1 (stability & safety):
- Chunked payloads or external artifact storage.
- QoS and retry tuning.
- Security allowlists, broker ACL guidance.
- Request correlation and audit events.

Extras (future):
- AI-driven investigation hooks: on failure, publish full DOM + network logs + console traces.
- Integration adapters for existing frameworks: provide Node.js client, Python client, and CI plugin.
- Support for multi-tab orchestration and session management.

## File-level blueprint for this repo
(Where to add/edit in the current workspace)
- `src/mqtt/bridge.js` — extend to handle new topic patterns and route to the service worker/background messaging APIs (see `src/background-sw.js` and `src/background-core.js`).
- `src/mqtt/mqtt-translator.js` or `mqtt/bridge.js` — add helper functions to serialize/deserialize the new protocol.
- `background-core.js` / `background-sw.js` — ensure the service worker loads the MQTT client and forwards commands to tabs; also handles clientId and persistent state.
- `content.js` — add command handler to receive `getDOM`, `click`, `fill`, `navigate`, `screenshot` requests and respond via runtime messaging.
- `offscreen-worker.js` — optionally handle heavy snapshotting or DOM operations when tab not visible.
- `messaging.js` — add helpers for request/response correlation within the extension.
- `docs/mqtt-remote-control-plan.md` — the plan (this file).

## Example sequences

Sequence: get DOM
1. Controller publishes command to `webbuddy/ci-1/cmd/client-123/req-r1` with payload action=getDOM.
2. Background receives and sends runtime message to the active tab content script: { requestId: r1, action: getDOM }.
3. Content script collects DOM, compresses/encodes as needed and posts result to background.
4. Background publishes response to `webbuddy/ci-1/resp/client-123/req-r1` with payload containing HTML (or a pointer to artifact).

Sequence: click -> run assertions
1. Controller sends click command and waits for ok response.
2. Controller can then send `getDOM` or `screenshot` to validate state.

## Command handler contract (content script)
Inputs:
- requestId, action, payload
Outputs:
- Success response: { requestId, status: ok, payload }
- Error response: { requestId, status: error, error: { code, message } }

Error modes to handle:
- Tab not found or detached
- Selector not found
- Permission denied for action
- Timeout

Edge cases:
- Pages with heavy dynamic content; snapshot size may exceed limits — use chunking or external upload.
- Cross-origin iframes — content script may not access cross-origin iframe DOM; return helpful error with detail.
- Extensions disabled or background disconnected — controller should observe heartbeats or online status topics.

## Testing and CI
Unit tests:
- Handler logic and message validation (tests exist under `test/translator` and `test/locator` — add `test/mqtt` with serializer/deserializer and handler unit tests).
Integration test (local):
- Run a test MQTT broker (Mosquitto) in a container during CI.
- Start a Chromium instance with the extension loaded (use puppeteer/playwright) and run commands from a Node.js test client, assert responses.

Quality gates:
- Build: ensure extension packs and scripts compile (if any bundling).
- Lint/Typecheck: pass linter rules.
- Tests: add fast unit tests and one integration smoke test.

## Minimal Node.js controller example (to include in docs)
- Show how to publish command, wait for response topic (subscribe to resp/<clientId>/reqId), and reassemble chunks.

## Operational considerations
- Broker selection: recommend Mosquitto for self-host, AWS IoT or HiveMQ for managed.
- Scaling: use topic partitions and instance IDs, and consider per-client queues.
- Privacy: sanitize DOM or redact sensitive fields optionally before sending.

## Scaling & self-identification (thousands of clients)

When deploying thousands of connected extension instances to a single MQTT broker, careful design is required for identification, scaling, topic cardinality, and operational visibility. Below are practical recommendations and patterns proven at scale.

1) Client identity and stable IDs
- Use a stable, globally-unique `clientId` for each extension installation. Do not rely solely on ephemeral identifiers. Suggested format: `<org>-<env>-<region>-<instanceType>-<short-uuid>` (e.g., `acme-ci-us-east-ext-3f2c1b`).
- Persist the `clientId` in extension storage (chrome.storage.local) on first run. Allow manual override via options for predictable lab deployments.
- Also publish a short `heartbeat` containing metadata on a low-frequency topic so controllers can discover active clients (`webbuddy/<instance>/status/<clientId>`).

2) Topic cardinality & routing patterns
- Avoid creating tens of thousands of unique subscription patterns on controllers. Prefer controller-driven wildcard subscriptions plus dynamic discovery. Examples:
  - Per-client command topic: `webbuddy/<instance>/cmd/<clientId>/+` (used by controllers addressed to a specific client).
  - Controller discovery topic (lightweight): `webbuddy/<instance>/status/+` (clients publish presence here; controllers subscribe to discover clients).
  - Broadcast commands should use `webbuddy/<instance>/broadcast/cmd` with careful rate-limiting.

3) Discovery and heartbeats
- Each client publishes a heartbeat every 30-120 seconds to `webbuddy/<instance>/status/<clientId>` with payload `{ clientId, version, lastSeen, capabilities, tabCount }`.
- Controllers should maintain an in-memory registry of active clients using these heartbeats. Treat an absence of heartbeats for a configurable TTL (e.g., 3x interval) as offline.

4) Sharding and broker topology
- For thousands of clients, consider horizontal scaling of broker via clustering (e.g., EMQX, HiveMQ cluster, VerneMQ) rather than a single Mosquitto instance.
- Use multiple broker instances with load balancing, or per-region brokers. Route controllers to the correct regional broker where clients connect.
- If using a single broker, monitor file descriptors and subscription limits; brokers have practical limits on number of topics and in-flight messages.

5) Topic subscriptions on controllers
- Controllers that need to talk to many clients should not subscribe individually to every client's `resp/<clientId>/+` topic. Instead:
  - Subscribe to `webbuddy/<instance>/resp/+` (one subscription) and filter by `clientId` in the message envelope.
  - Use a dedicated response topic for controller sessions when tight correlation is needed: controller can publish a `replyTo` value in the command envelope and subscribe to that session topic (ephemeral, short-lived).

6) Rate-limiting and backpressure
- Implement client-side command throttling—if commands arrive faster than a client can handle, respond with status `busy` and an estimated retry-after.
- Controllers should implement exponential backoff for retries and observe QoS semantics.

7) Message size strategy at scale
- Avoid large DOM dumps in heartbeats or frequent events. Use the artifact-upload pattern (upload to blob store) for large payloads and only publish metadata in MQTT messages.
- If chunking is used, ensure chunk reassembly is robust and include checksums to detect missing/duplicate chunks.

8) Security & ACLs at scale
- Enforce topic-level ACLs on the broker so a controller can only publish to allowed `instance` paths and cannot impersonate other `clientId`s.
- Issue short-lived tokens for controller sessions using a token service. Rotate tokens and provide revocation.

9) Operational monitoring & tooling
- Expose metrics from the background MQTT client (published to `webbuddy/<instance>/metrics/<clientId>`) with counters for commands received, responses sent, errors, and queue lengths.
- Maintain a discovery service or dashboard that consumes `status` heartbeats and shows topology, versions, and health.

10) Example scaled discovery flow
- On startup, controller subscribes to `webbuddy/<instance>/status/+`.
- Clients publish heartbeat every 60s to `webbuddy/<instance>/status/<clientId>`.
- Controller builds a registry and selectively subscribes or issues commands using per-client topics or a temporary `replyTo` topic for session-level replies.

These patterns balance topic cardinality, discovery speed, security, and operational visibility and will allow the system to scale to thousands of connected extension instances reliably.

## Network monitoring & API extraction

Goal: capture network activity from the page so the extension can:
- Report which backend APIs and endpoints a page calls (method, URL patterns, hostnames).
- Capture request/response metadata and optionally bodies for schema extraction.
- Publish compact API usage summaries over MQTT and allow controllers to request deeper artifacts on demand.

Design principles:
- Non-invasive: do not break the page's normal behavior or add excessive latency.
- Privacy-first: never publish sensitive fields (PII, auth headers, tokens) unless explicitly allowed by the user and only to secured brokers.
- Efficient: aggregate and publish summaries; use artifact uploads for large bodies.

Where to capture:
- Content script level: use the browser's webRequest API where available (extension background can use `chrome.webRequest` with appropriate permissions), or instrument fetch/XHR by injecting a small page script that wraps `window.fetch` and `XMLHttpRequest`.
- Background/offscreen: for requests originating from extension contexts (offscreen or background), capture directly there.

Capture model and schema:
- For each observed HTTP interaction record:
  - id: uuid
  - timestamp
  - clientId
  - pageUrl
  - tabId
  - frameId (if available)
  - direction: request|response
  - phase: request|response|error
  - method
  - url (optionally truncated/normalized)
  - host
  - pathPattern: normalized path with parameter placeholders (see below)
  - status (for responses)
  - latencyMs
  - requestHeaders (redacted)
  - responseHeaders (redacted)
  - requestBodyMeta: { size, contentType, fingerprint }
  - responseBodyMeta: { size, contentType, fingerprint }
  - error (if any)

Path normalization and pattern extraction:
- Convert concrete paths into parameterized patterns so we can group API calls. E.g., `/api/users/123/orders/987` -> `/api/users/{userId}/orders/{orderId}`.
- Use heuristics + regex to detect numeric or uuid segments and replace them with tokens. Keep a small sample window per endpoint to learn common parameter formats.

Summaries and publication:
- Aggregate counts by host + pathPattern + method over a short window (e.g., 30s) and publish a compact summary message on `webbuddy/<instance>/api/summary/<clientId>` with: { clientId, timestamp, samples: [ { host, pathPattern, method, count, lastSeen, latencyP50,P95 } ] }.
- For on-demand deep-dive, the controller can send `getApiArtifact` for a specific `pathPattern` which triggers the extension to publish full captured samples or upload artifacts and respond with a pointer.

Privacy redaction and governance:
- Default redaction rules:
  - Strip Authorization, Cookie headers, and any header names matching `token|auth|session|cookie`.
  - For request/response bodies, keep only content-type and a small hash/fingerprint. Bodies are only captured fully when the user explicitly enables it or a controller requests it and the client settings allow.
- Provide a per-instance allowlist of domains/endpoints where full capture is allowed (useful for internal API testing).

Storage and memory management:
- Keep an in-memory circular buffer of recent N (e.g., 1000) network events per client; evict oldest items as needed.
- For persisted artifacts (when uploading), use temporary storage (offscreen or background) and clear after upload or TTL expiration.

Message contracts (summary):
{
  "protocolVersion": "1.0",
  "type": "event",
  "eventType": "apiSummary",
  "clientId": "client-123",
  "payload": {
    "timestamp": 1697360000000,
    "samples": [
      { "host": "api.example.com", "pathPattern": "/api/users/{userId}/orders", "method": "GET", "count": 12, "latencyP50": 120, "latencyP95": 450 }
    ]
  }
}

Message contracts (artifact request):
Command: `action`: `getApiArtifact` payload: { requestId, pathPattern, timeWindow, maxSamples }
Response: publishes either chunks or an artifact pointer with uploaded sample data.

Implementation notes & repo hooks:
- `content.js` — inject a small instrumentation script that wraps `fetch` and `XMLHttpRequest`, emits lightweight events to the content script context (avoid capturing bodies inline unless allowed).
- `background.js` / `offscreen-worker.js` — implement `chrome.webRequest` handlers (requires host permissions) for more robust capturing and to get full header/body access where permitted.
- `messaging.js` — add new message types for `apiEvent`, `apiSummary`, and `apiArtifact` between background and content.
- `src/mqtt/bridge.js` — add publishing logic for `apiSummary` events and handling `getApiArtifact` commands.

Edge cases and limitations:
- Cross-origin iframes and same-site restrictions may block access to some requests; document what can and cannot be captured and include explicit error metadata in event records.
- Large binary responses should never be auto-captured; only metadata and pointer to external upload.
- Instrumentation must be fault-tolerant and not throw into page context. Use try/catch around injected hooks.

Testing & verification:
- Add unit tests for the path normalization heuristics (e.g., numeric segments, UUIDs, email-like tokens).
- Integration test: run a test page that performs known XHR/fetch calls and assert the extension publishes an `apiSummary` with expected pathPatterns and counts.

This network monitoring capability provides the raw signals to enable later automatic API schema extraction, test generation, and AI-augmented failure investigation while preserving privacy and operational scale.

## Timeline & milestones (example)
- Week 1: Design, proto message schema, todo list and plan (this document).
- Week 2: Audit code, implement background MQTT routing and basic content handlers for `getDOM` and `click`.
- Week 3: Add chunking and screenshot, start integration tests.
- Week 4: Security hardening and documentation, publish Node.js controller example.

## Next steps (short term)
1. Audit the existing MQTT modules and messaging connectors to pick exact integration points. (I'll do this next if you want.)
2. Agree on topic names and JSON schemas, then implement the background subscription + handler.
3. Build the MVP and run integration smoke tests locally.


---

Appendix: quick JSON schema sketches and example messages can be added on request.
