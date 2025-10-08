# Robotcorder — Developer Guide

This document explains what Robotcorder is, how it works, where the important pieces of code live, how to run and test locally, and notes for contributors.

## Quick overview

Robotcorder is a browser extension (Chrome-style, Manifest V2) that records user interactions and scans HTML pages to testcases. It provides two primary flows:

- Recording: listen to user events (clicks, changes, keyboard triggers), capture element descriptors and produce a sequence of actions, then translate them into test cases.
- Scanning: traverse the DOM and build a prioritized set of locators for inputs/controls to help generate scripts or Page Object Model (POM) data.

Core goals: create readable, framework-agnostic testcase artifacts from live interactions and page inspection, with configurable locator strategies and pluggable translators for different output formats (RobotFramework, Cypress, Playwright, etc.).

New: MQTT + LLM integration

This repository also includes (or is being extended with) an MQTT-based integration to enable communication between the extension and an external LLM-enabled application. The goal is two-fold:

- Allow the extension to publish real-time context (recorded events, page DOM snapshots, candidate locators) to an MQTT broker so an LLM can consume context and propose or generate test steps.
- Allow the LLM (or any MQTT client with appropriate permissions) to send commands back to the extension to drive the browser in real time — for example to execute suggested steps, run checks, or refine locators.

This enables a tightly-coupled human+AI workflow where the AI can inspect live page context and create or adapt test steps interactively.

## Where to start (key files)

- `manifest.json` — extension registration, lists background scripts and content scripts injected into pages.
- `src/background-core.js` — central controller. Handles UI commands (from popup/options), manages state in `chrome.storage.local`, coordinates content script messages, and calls translators to generate script output.
- `src/content.js` — content script glue. Adds DOM listeners (click/change/keydown) and sends parsed events to the background script. Also handles the "scan" path by invoking the scanner to walk the DOM.
- `src/constants.js` — UI/constants used across the extension (icons, filenames, status messages, default locators, etc.).
- `src/locator/` — locator pipeline used by the scanner and on-the-fly parsing:
  - `tree-builder.js` — builds an array of element + parent attributes (a tree) used to compute locators.
  - `scanner.js` — drives DOM traversal (scan) and single-node parsing (for events). It uses `builder` and `classifier` and calls `locator.build` to compute a path.
  - `classifier.js` — classifies nodes (e.g., input types such as text, file, select, button, link). (Tests in `test/locator` reference this behaviour.)
  - `xpath-locator.js` — helper to produce xpath or selector expressions (used by the `locator` module referenced throughout).
  - `tree-builder.js` — builds the parent chain with attributes (already listed above).
- `src/translator/robot-translator.js` — maps recorded events into Robot Framework keywords and builds the final file text. Also supports generating full Robot files (libraries, variables, a test case, etc.).
- `src/translator/cypress-translator.js` — another translator present (registered in `manifest.json`) for other output formats.
- `src/options.js`, `src/popup.js`, `src/options.html`, `src/popup.html` — UI for the extension's popup and options page where users start/stop recording, change locator priority and export scripts.
- `test/` — Mocha/Chai tests and `setup.js` for test environment using `jsdom`/`sinon-chrome`.

## Message & Data contract

Background and content scripts communicate via `chrome.runtime.sendMessage` with a simple message shape. Common fields:

- `operation` (string): action to perform. Known operations include: `record`, `pause`, `resume`, `scan`, `stop`, `save`, `settings`, `load`, `info`, `action`, `pomer`, `pomerSelect`, `pomerSelect`
- `locators` (array of strings): locator strategy priority (e.g., `["for", "name", "id", "title", "href", "class"]`)
- `scripts` / `script`: arrays or objects representing parsed element/actions created by the scanner or on-the-fly parsing
- `results`, `request`, and other ad-hoc payloads used for specialized flows

Element descriptor shape created by `scanner.parseNode` / `classifier.classify` (typical keys):
- `type` — e.g. `text`, `file`, `button`, `a`, `select`, `hover`, `url`, `default`.
- `path` — computed locator string (constructed by `locator.build` / xpath logic).
- `time` — timestamp when recorded
- `trigger` — event trigger like `click`, `change`, `hover` (the translator often inspects this)
- `title`, `path` (where applicable)

Translators expect a list of these event objects and will produce framework-specific commands. The project ships `robot-translator.js` and `cypress-translator.js` as examples; translators should implement a small, consistent interface (see Implementation notes below) so adding outputs for Playwright, Puppeteer, or a custom runner is straightforward.

## Typical runtime flows

1. User presses "Record" in the popup. Popup sends `{operation: 'record', locators: [...]}` to background.
2. `background-core.js` sets icon, initializes `list` with a `url` event and sends a message to the active tab's content script.
3. `content.js` receives `{operation: 'record'}` and attaches `click`, `change`, and `keydown` listeners. When an event occurs it calls `scanner.parseNode(...)`.
4. The parsed node object is sent back to the background via `runtime.sendMessage` with `operation: 'action'` and either `script` (single) or `scripts` (array from scan).
5. `background-core.js` accumulates events in `list`. When the user clicks Stop, it calls `translator.generateOutput(list, maxLength, demo, verify)`.
6. Generated script is saved to `storage` and can be downloaded via `background-core.js` using the `downloads` API.

Scan flow is similar but uses `scanner.parseNodes` to walk the DOM and returns many candidate locator objects.

MQTT / LLM-assisted flow (high-level)

1. When recording or scanning, the background script can optionally publish the recorded events (or the full set of candidate locators and a DOM snapshot) to an MQTT topic so an external LLM client can consume the context.
2. The LLM processes the context and publishes proposed actions, test steps, or change suggestions to a control topic.
3. The extension subscribes to that control topic and handles incoming commands according to a configurable execution mode (see next section): either auto-execute allowed actions, or surface suggestions for user review/approval before running.
4. The extension may then record the LLM-driven actions back into its event `list` so they become part of the generated test.

This flow enables both assisted testcase authoring (AI suggests steps which the user accepts) and fully automated scripted runs controlled by an LLM (if the user explicitly enables that capability).

Execution modes (Full automation vs User suggestion)

To safely support AI-driven control, the extension exposes a toggleable execution mode that governs how control messages from MQTT/LLM are handled. The two primary modes are:

- suggestion (default): LLM proposals are shown in the popup/options UI and require explicit user approval to execute. This mode is safest and recommended for most users.
- automatic: allowed proposals are executed immediately in the active tab without additional user approval. Use only when you fully trust the LLM client and the broker configuration.

Granularity and allowlists

The toggle should not be a single global on/off. Provide granular controls:

- per-test-type settings: allow automatic execution for `manual`/`functional` but require review for `chaos`/`security`/`load`.
- per-action allowlist: permit safe actions (click, navigate, input) while disallowing dangerous ones (file upload, download, clipboard write, arbitrary eval).
- rate limits and concurrency caps: limit number of auto-executed actions per minute and max concurrent sequences.

Storage schema (example)

Store the user preferences in `chrome.storage.local` under a clear key like `execution_policy`.

```json
{
  "execution_policy": {
    "mode": "suggestion",           // "suggestion" | "automatic"
    "per_test_type": {"functional":"automatic","chaos":"suggestion","load":"suggestion"},
    "allowed_actions": ["click","navigate","input"],
    "rate_limit": {"actions_per_minute": 120},
    "require_second_approval_for": ["chaos","security","load"]
  }
}
```

UI behaviour

- Options page: present the `execution_policy` UI. Make the default `suggestion` and prominently warn about risks when enabling `automatic`.
- Popup: when a suggestion arrives and `mode` is `suggestion`, show a compact actionable card with the suggested steps, confidence, and buttons: Accept & Run / Edit & Run / Reject. When `mode` is `automatic` and the proposal is allowed by the policies, show a notification/toast with an option to Undo for a short time window.

Implementation guidance (background/content)

Background responsibilities:

- Subscribe to MQTT control topics and validate incoming command messages (schema, source, timestamp).
- Consult `execution_policy` before forwarding commands to the content script.
- If `mode === 'automatic'` and the message is allowed, forward the vetted action(s) to the content script and publish an execution acknowledgement to `robotcorder/{clientId}/actions`.
- If `mode === 'suggestion'`, store the suggestion and trigger a UI update so the popup/options can display it for review.

Content responsibilities:

- Expose a minimal executor that performs a restricted set of DOM actions upon explicit instruction from the background. Never allow direct MQTT messages to reach content scripts — the background must mediate.
- When actions are executed, return structured results (success/failure, logs) back to background which then publishes them to `robotcorder/{clientId}/actions`.

Pseudocode (background)

```js
// on mqtt message
const msg = parse(message);
const policy = await storage.get('execution_policy');
if (!validate(msg)) return; // ignore malformed
const ttype = msg.test_type || 'functional';
const allowed = policy.allowed_actions.includes(msg.command.action);
const mode = policy.per_test_type[ttype] || policy.mode;
if (mode === 'automatic' && allowed) {
  // forward to content and publish ack
  chrome.tabs.sendMessage(activeTabId, {operation:'execute', command: msg.command});
  mqtt.publish(`robotcorder/${clientId}/actions`, {status:'executed', id: msg.id});
} else {
  // save suggestion for UI review
  saveSuggestionForUI(msg);
  // notify popup if open
}
```

Pseudocode (content executor)

```js
// background sends: {operation:'execute', command:{action:'click', path: '...'}}
chrome.runtime.onMessage.addListener((request) => {
  if (request.operation === 'execute') {
    const { action, path, value } = request.command;
    // execute only whitelisted actions
    if (['click','input','navigate','select'].includes(action)) {
      const el = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      // safe execution with try/catch and minimal timeouts
      // ... perform action, then send result back
    }
  }
});
```

Audit logging and undo

- Keep an immutable audit log of LLM-driven suggestions and executed actions in `chrome.storage.local` for traceability.
- Provide a short Undo window for auto-executed actions where feasible (reverse a simple click/input by navigating back or by re-running a corrective action), or at minimum show clear execution logs and links to restore states if possible.

Defaults and recommendation

Default to `suggestion` mode. Require an explicit, well-documented action in the options UI to enable `automatic`. Also require a dedicated consent step for enabling auto-execution of sensitive `test_type`s such as `chaos`, `load`, and `security`.

Test types & AI categorization

One of the goals for the MQTT + LLM integration is to enable the AI to not only suggest steps, but also to categorize those steps and the resulting sequences into different kinds of test cases. The extension should support creating and exporting multiple test case types, including but not limited to:

- Manual test cases: human-readable checklists with steps and expected results. Useful for QA reviewers and for exploratory testing.
- Functional test cases: deterministic interaction sequences that assert UI behaviour (click/input/assert). Export targets: RobotFramework, Cypress, Playwright, Selenium, etc.
- Load / performance test cases: scenario definitions that can be executed with k6, JMeter, Playwright with concurrency, or cloud load runners. These require a load profile (users, ramp-up, duration) and clear performance assertions.
- Chaos test cases: scenarios that include fault injection (network latency, service failures, resource exhaustion). Export targets might include chaos toolkits or test harness directives for fault injection.
- Security / fuzz tests: sequences that include malformed inputs, auth boundary checks, or injection attempts. These are sensitive and should be gated behind explicit user intent.
- Accessibility tests: sequences that exercise keyboard-only navigation, ARIA attributes, and automated accessibility assertions.
- Regression suites and smoke tests: aggregated, prunable suites built from accepted suggestions.

How AI categorization works (high level)

1. The extension publishes contextual information (events, candidate locators, optional pruned DOM snapshots) to MQTT. Each event can include minimal metadata fields described below.
2. An LLM or classification model consumes the events and returns a suggested `test_type` and, optionally, a confidence score plus recommended metadata (tags, priority, suggested assertions, expected outcomes).
3. The background script collects these suggestions and either automatically maps them to a translator for the desired export format or shows them in the UI for user review and edits.
4. When the user accepts or the system auto-approves, the extension generates the appropriate artifact (file or action list), and stores a canonical representation that includes both the steps and the test-level metadata.

Suggested per-event and per-test metadata

Attach these fields where applicable to events or to the generated test object. Translators and the MQTT payloads should include them so consumers (LLM or executors) can make informed decisions.

- test_type: string (one of: manual, functional, load, chaos, security, accessibility, regression, smoke)
- tags: array[string] (free-form tags like ["login","critical","payment"])
- priority: string (low, medium, high, p0, p1, ...)
- intent: string (short natural language summary of what the test checks)
- assertions: array[object] (optional structured assertions: {path, assertionType, expected})
- load_profile: object (for load tests: {users, ramp_up_seconds, duration_seconds, arrival_rate})
- chaos_config: object (for chaos tests: {targets, fault_type, duration})
- confidence: number (0..1, when classified by an LLM)
- origin: string ("user-recorded" | "llm-suggested" | "hybrid")
- created_by: string (client id / user id / tool)

MQTT topic and payload updates for test types

Extend the topic set to include test plan and execution topics. Recommended additions:

- `robotcorder/{clientId}/plans` — where the extension or LLM publishes a full suggested test plan (metadata + steps).
- `robotcorder/{clientId}/executions` — messages about execution requests and status updates (start, progress, result).
- `robotcorder/{clientId}/assertions` — suggested or recorded assertions for steps.

Example: a `plans` payload for a load test

```json
{
  "type": "plan",
  "id": "plan-<uuid>",
  "test_type": "load",
  "title": "Login load test",
  "tags": ["login","performance"],
  "load_profile": {"users": 200, "ramp_up_seconds": 60, "duration_seconds": 600},
  "steps": [
    {"action":"navigate","path":"/login"},
    {"action":"input","path":"//input[@name=\"username\"]","value":"{{USERNAME}}"},
    {"action":"input","path":"//input[@name=\"password\"]","value":"{{PASSWORD}}"},
    {"action":"click","path":"//button[@type=\"submit\"]"}
  ],
  "assertions": [{"path":"//div[@id=\"welcome\"]","assertionType":"contains","expected":"Welcome"}],
  "origin":"llm-suggested",
  "confidence": 0.92
}
```

Example: a `plans` payload for a chaos test

```json
{
  "type": "plan",
  "id": "plan-<uuid>",
  "test_type": "chaos",
  "title": "Payment service latency injection",
  "tags": ["payments","chaos"],
  "chaos_config": {"targets":["/api/payments"], "fault_type":"latency", "latency_ms": 1000},
  "steps": [ ...actions... ],
  "origin":"llm-suggested",
  "confidence": 0.88
}
```

Translators and executors

Translators should accept a `test_type` parameter and either:

- Produce a framework-specific artifact appropriate for the type (e.g., k6 script for load tests, chaos toolkit harness for chaos tests, RobotFramework/Cypress tests for functional flows).
- Produce a framework-agnostic action array plus metadata that an external executor can use to run the test.

For example, a `load-translator` might convert a plan into a k6 script and a `chaos-translator` might convert chaos plans into directives for a chaos toolkit or a custom harness.

UI and review flow

- Suggestion review: present LLM suggestions in the popup/options UI grouped by `test_type` with the confidence score and editable metadata. Allow users to accept (and optionally execute), reject, or edit suggestions.
- Export: when exporting, include the test-level metadata as headers or JSON alongside the exported file so downstream systems (CI, test management) can pick up metadata.

Security and safety considerations for test types

- Sensitive operations: security, chaos, and load tests can impact systems and should be gated behind explicit permissions, rate limits, and possibly a separate secure mode. Do not auto-execute these without explicit user consent.
- Data handling: load and chaos tests may generate large volumes of traffic or reveal sensitive data. Provide options to redact or hash captured values in DOM snapshots and event payloads.
- Approval workflow: consider adding a staged approval flow for any LLM-suggested plan that has `test_type` in ["chaos","security","load"] where a second human confirmation is required before execution.

Implementation notes (small steps)

1. Add a `test-classifier` module that takes an event list and runs a simple heuristic or model to propose `test_type` and metadata; this module can be local (rules-based) or remote (LLM via MQTT).
2. Extend the event model used by `scanner` and `background` to include the metadata fields listed above. Keep defaults minimal and opt-in for sensitive fields.
3. Update translators to accept `options.test_type` and produce appropriate outputs. Add example translators for `load` (k6) and `chaos` (chaos toolkit or JSON directives).
4. Add UI controls in `options.html` for default test type preferences and safety settings (auto-execute, allowlist, redaction).

This design allows the LLM to not only generate steps but also categorize and enrich them so the extension can export, execute, and manage a wide spectrum of automated and manual tests.

## Running and testing locally

Prerequisites: Node.js (recommended LTS) and yarn or npm.

From the repo root (zsh):

```bash
# install deps (yarn preferred) -- fallback to npm if you don't use yarn
yarn install
# or
npm install

# lint
yarn run lint

# run the unit tests
yarn run test-local
# or combined: yarn run test
```

Loading the extension in Chrome (development):
1. Build or ensure `src/` files exist (the repo is already ready to load as an unpacked extension).
2. Open `chrome://extensions/`, enable Developer mode.
3. Click "Load unpacked" and select the project root folder.
4. Use the popup to start/stop recording on any page.

MQTT-enabled local development

If you plan to exercise the MQTT/LLM features locally, set up an MQTT broker that supports WebSockets (for direct use from the extension background page) or run a small bridge service (native process or remote server) that forwards messages between the broker and the extension. Example brokers supporting WebSockets: Mosquitto (with websockets enabled), EMQX, HiveMQ.

The basic steps:

```bash
# start a local broker (example for mosquitto if installed with websockets enabled)
# configure mosquitto.conf to allow listener on a websocket port, then run
mosquitto -c /path/to/mosquitto.conf
```

In the extension you will configure the broker URL, topic prefix and authentication (see the MQTT section below). For local dev you can run without authentication on localhost but never do this in production.

## Tests

Unit tests use Mocha + Chai with `jsdom` and `sinon-chrome` for Chrome API stubbing. Look under `test/` for examples for locator modules and translator tests. Run via `yarn run test-local`.

## Maintenance notes & suggestions

- Manifest v2: This project uses Chrome Manifest V2 which is deprecated in modern Chrome/Chromium. Consider migrating to Manifest V3 (service workers instead of persistent background pages) for future compatibility.

- Message shapes: the runtime message payloads are flexible but not typed. Consider centralizing and documenting the message schema in `src/constants.js` or a small `messages.js` to make future changes safer.

- MQTT & LLM: Because external AI-driven clients will consume and control the extension via MQTT, the message formats and topics should be treated as a stable public contract. Document the topics and JSON schemas (see the MQTT section below) and consider versioning topic prefixes (for example `robotcorder/v1/...`) so backward-incompatible changes are manageable.

- Locator strategy: default locators are configured in `constants.js` and stored in `chrome.storage.local`. There's a `tree-builder` + `locator` pipeline — adding a new locator (e.g., data-qa attributes) is done by updating `constants` and ensuring `builder._buildAttributes` can read that attribute.

- Translators: `robot-translator.js` generates simple, readable RobotFramework steps. If adding more output formats, implement a translator module with the same public methods: `generateOutput(list, length, demo, verify)` and `generateFile(...)`.

- Framework-agnostic translators: aim for a minimal contract for translator modules:
  - generateOutput(events[], options) -> string[] or single string (list of steps, or file body)
  - generateFile(events[], options) -> full file text (including headers/libs)
  - optional: generateActions(events[], options) -> array of runtime actions (framework-neutral) that could also be sent to an executor or the MQTT broker

This lets the same recorded events be serialized into different frameworks, or be translated into neutral actions (e.g., {type: 'click', path: '...'} ) used for realtime execution.

- Tests: add a couple of integration tests that spin up `jsdom` pages with common form controls and assert translator output for typical recorded sequences.

- Add tests for the MQTT publish/subscribe contract (mock broker) and translator compatibility with the action schema. Unit-tests should verify that recorded event lists are convertible to both framework-specific code and neutral action arrays used by MQTT.

## Quick reference: file responsibilities

- `manifest.json` — extension configuration
- `src/background-core.js` — orchestration and translation
- `src/content.js` — DOM events wiring
- `src/constants.js` — strings, messages, defaults
- `src/locator/*` — builder, classifier, locator, xpath logic
- `src/translator/*` — Robot/Cypress output generators
- `src/popup.*`, `src/options.*` — UI
- `test/*` — unit tests

MQTT-related places to extend:

- `src/background-core.js` — natural place to add an MQTT client (or to call an MQTT bridge). Background script can publish recorded events, subscribe to control topics and route incoming commands to the active tab via `chrome.tabs.sendMessage`.
- `src/content.js` — execute runtime actions received from the background (click, input, navigate). Keep execution gated behind explicit permissions and user settings.
- `src/translator/*` — add an `mqtt-translator.js` or a method that converts events into a framework-agnostic action array which can be sent over MQTT.


## Next steps / low-risk improvements you can make now

- Add typed message schemas (JSDoc or TypeScript) to reduce runtime bugs.
- Migrate to Manifest V3 (medium effort).
- Add more unit tests for the `locator` pipeline and translators (especially around edge cases where multiple similar elements exist).
- Add CI steps that run `yarn run lint` and `yarn run test-local` on PRs.

- Implement an `mqtt` settings page in the extension options where operators can configure:
  - broker URL (wss://... for secure WebSockets)
  - topic prefix or client-id
  - authentication (username/password, token) stored in `chrome.storage.local` and used only by background context
  - trust / safety options: auto-execute vs. user-approval, rate limits, allowed action types

- Add a `mqtt-translator` that emits neutral action messages for consumption by an LLM or remote test executor.

---

MQTT integration: topics, payloads and examples

Topic layout (recommended):

- robotcorder/{clientId}/events — published by extension; sequence of events or incremental event messages
- robotcorder/{clientId}/dom_snapshot — optional, full DOM or a pruned snapshot for the LLM to analyze (be mindful of size)
- robotcorder/{clientId}/actions — published by extension to indicate actions executed
- robotcorder/{clientId}/control — subscribed by extension; LLM publishes commands here for the extension to run
- robotcorder/{clientId}/suggestions — LLM publishes suggestions or candidate test steps for review

Payload shapes (JSON recommended):

- Event message (published by extension)

```json
{
  "type": "event",
  "id": "evt-<uuid>",
  "time": 1620000000000,
  "event": {
    "type": "text",
    "trigger": "change",
    "path": "//input[@id=\"email\"]",
    "value": "alice@example.com",
    "title": "My Page Title"
  }
}
```

- Action command (published by LLM to `control`, consumed by extension)

```json
{
  "type": "command",
  "id": "cmd-<uuid>",
  "time": 1620000001000,
  "command": {
    "action": "click",
    "path": "//button[@id=\"submit\"]"
  },
  "meta": {
    "explain": "Click submit to send the form",
    "confidence": 0.87
  }
}
```

- Suggestion message (LLM -> `suggestions`)

```json
{
  "type": "suggestion",
  "id": "sugg-<uuid>",
  "steps": [
    {"action":"input","path":"//input[@name=\"username\"]","value":"<USERNAME>"},
    {"action":"input","path":"//input[@name=\"password\"]","value":"<PASSWORD>"},
    {"action":"click","path":"//button[@type=\"submit\"]"}
  ],
  "explain": "Login test for the demo site"
}
```

Implementation and safety notes

- Execution gating: Default to NOT auto-execute commands received from MQTT. Provide a user setting for auto-execution and a fine-grained allowlist (e.g., permit clicks/navigation but block file uploads or downloads unless explicitly allowed).
- Authentication & encryption: Use TLS (wss://) and broker authentication (tokens or username/password). Do not store secrets in plaintext in the repository. Use `chrome.storage.local` and provide clear instructions in the options UI for operators to enter tokens.
- Size and privacy: Full DOM snapshots can be large and may include sensitive data. Consider pruning snapshots (send only relevant subtrees or hashed values) and require explicit user consent to publish snapshots to any external AI service.
- Rate limiting and replay: Keep an event buffer and enforce rate limits to avoid flooding the broker. Provide a replay mechanism so LLM-generated sequences can be executed deterministically later.

Where to add code

- Background: add an MQTT client that supports WebSockets (for example the MQTT.js library in a background page or a small native bridge). The background will publish events and subscribe to control topics.
- Content: expose a safe executor that receives vetted commands from the background and performs DOM actions.
- Translators: add a method to produce framework-agnostic action arrays in addition to framework-specific files.

---

If you'd like, I can implement the following next: a) add an `mqtt-translator` that converts recorded events to neutral action JSON and publishes them to MQTT; b) scaffold a secure options UI to configure broker URL and auth; or c) add unit tests that validate the MQTT message formats using a mock broker. Tell me which and I'll proceed.

---

If you'd like, I can also:
- Create a shorter README summary for the project root with developer quick-commands.
- Produce sequence diagrams for the recording/scan flows.
- Start a small refactor: centralize message definitions and add a small test suite proving the `robot-translator` output for a synthetic event list.

Which would you like me to do next?