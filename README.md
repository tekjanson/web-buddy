# Web Buddy
[![Greenkeeper badge](https://badges.greenkeeper.io/tekjanson/WebBuddy.svg)](https://greenkeeper.io/)
[![Build Status](https://travis-ci.org/tekjanson/WebBuddy.svg?branch=master)](https://travis-ci.org/tekjanson/WebBuddy)
[![Known Vulnerabilities](https://snyk.io/test/github/tekjanson/web-buddy/badge.svg?targetFile=package.json)](https://snyk.io/test/github/tekjanson/web-buddy?targetFile=package.json)

> A browser extension (beta) that generates [RobotFramework](http://robotframework.org/) test scripts

Repository: https://github.com/tekjanson/web-buddy

Web Buddy is a lightweight browser extension (beta) that helps you generate readable automated UI test artifacts by recording user interactions and scanning pages. It ships translators for Robot Framework, Cypress, and Playwright, and includes an optional MQTT-based integration for AI-assisted test generation.

Highlights

- Record user actions (click, input, navigation) and export as test scripts.
- Scan pages to build prioritized locators and POM metadata.
- Translators for Robot Framework, Cypress, Playwright (extendable).
- Optional MQTT bridge for LLM-assisted suggestions and remote execution.

Quick links

- Edit locators: use the Options page to adjust locator priority or edit saved POM entries.

- `automatic` execution is available behind an explicit user toggle and allowlists; it carries risk and should only be enabled for trusted brokers/clients.
## How To Add The Extension
2. Once the reposityry has been cloned, go to chrome://extensions/
# Web Buddy

Web Buddy is a lightweight browser extension and developer toolkit that helps you create readable, maintainable UI test artifacts by recording user interactions and scanning pages for robust locators. It focuses on producing framework-agnostic action arrays and translators so the same recording can be exported to Robot Framework, Cypress, Playwright, or other frameworks.

Why use Web Buddy

- Rapidly capture real user flows and export them as executable test scripts.
- Produce prioritized locators and Page Object Model metadata to make tests more resilient.
- Plug in multiple translators to target different test frameworks without changing recordings.
- Optional MQTT integration for AI-assisted suggestions and remote orchestration (opt-in and gated by user settings).

Repository layout

- `src/` — extension source (background, content, messaging, translators, locator pipeline)
- `docs/` — static site exported for GitHub Pages (prebuilt site assets live here)
- `test/` — Mocha + Chai unit tests
- `vendors/` — bundled vendor libraries and helpers

Quick start (developer)

Prerequisites

- Node.js (LTS recommended, v14+)
- yarn (recommended) or npm
- Chrome/Chromium for extension testing

Install dependencies

```bash
# from repo root
yarn install
# or
npm install
```

Run lint and tests

```bash
yarn run lint
yarn run test-local
```

Load as unpacked extension (dev)

1. Open `chrome://extensions/` and enable Developer mode.
2. Click "Load unpacked" and select the repository root.
3. Use the popup to start/stop recording while browsing.

Regenerating the docs site (notes)

The `docs/` folder contains a pre-built static site (JavaScript bundles and assets). There are two supported approaches to "regenerate" the site:

1) Rebuild from site sources

	If you have the original site sources (React/webpack project), build them (usually `yarn build`) and copy the `build/` output into `docs/`.

	Example (if site sources are present):

	```bash
	yarn install
	yarn build
	cp -r build/* docs/
	```

2) Text-only updates to the built site

	When the site sources are not available in this repo, it's safe to make conservative, text-only changes to the built assets in `docs/static/js` or `docs/static/css` to change branding, badges, or copy. This is a brittle approach (editing generated files) so keep changes minimal.

What I can do now

- Replace the repository `README.md` with a modern developer-focused README (done).
- Perform conservative, text-only fixes in `docs/static/js` and `docs/static/js/*.map` to remove remaining references to the old name and update public links so the docs site renders as "Web Buddy". (I will not change runtime logic, only string literals and links.)

If you'd prefer a full rebuild of the docs site instead, tell me where the site sources live or add them to the repository and I will run the build script and copy the output into `docs/`.

Developer workflow & tests

- Core behavior: record events in the content script, send parsed events to background which accumulates them. Translators convert event lists into framework-specific artifacts.
- Unit tests use `jsdom` and `sinon-chrome`. Run them with `yarn run test-local`.

Contributing

- Fork, create a branch, and open a PR. Please include unit tests for new functionality.

License

MIT — see `LICENSE` for details.

[![forthebadge](https://forthebadge.com/images/badges/check-it-out.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/does-not-contain-msg.svg)](https://forthebadge.com)
[![forthebadge](https://forthebadge.com/images/badges/powered-by-water.svg)](https://forthebadge.com)




## Future work and known issues
1. need a way to automatically source the keyword file in the robot script file
2. bug with the recorder loosing focus on tab when interacting with POM popup, to get around this start recording before selecting your POM
3. Add a way to run execute the dynamic POM, this will also be extremely helpful for debugging
4. look into adding API testing