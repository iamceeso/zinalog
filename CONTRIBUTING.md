# Contributing to ZinaLog

Thanks for helping improve ZinaLog. This project is a lightweight, self-hosted logging server built with Next.js, React, TypeScript, and SQLite. Good contributions keep the product simple to run, easy to reason about, and safe to operate.

This guide explains how to contribute code, tests, docs, and fixes in a way that matches the current repository structure and workflow.

## Ways to contribute

Contributions do not have to be large to be useful. Helpful work includes:

- fixing bugs
- improving tests
- tightening validation or error handling
- refining the dashboard UX
- improving docs and examples
- reporting bugs with clear reproduction steps
- proposing focused enhancements

If you are planning a larger change, open an issue or start a discussion first so the approach can be aligned before you invest time in implementation.

## Before you start

Please take a few minutes to review the repository docs before opening a pull request:

- `README.md` for product behavior, local setup, API usage, and operational notes
- `CODE_OF_CONDUCT.md` for community expectations
- `SECURITY.md` for how to report vulnerabilities or security-sensitive issues

Do not open a public issue for a suspected security vulnerability. Follow `SECURITY.md` instead.

## Development environment

### Prerequisites

- Node.js 20 or newer
- npm

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Then open `http://localhost:3000`.

### First-time app setup

ZinaLog bootstraps itself through the setup flow when the database has no users.

1. Start the app locally.
2. Visit `http://localhost:3000/setup`.
3. Create the first admin account.
4. Sign in and create an API key.
5. Send a test log to `POST /api/logs`.
6. Confirm the log appears in the dashboard.

### Useful environment variables

ZinaLog works with sensible defaults, but these variables are commonly useful during development:

- `DATABASE_PATH` to point the app at a specific SQLite file
- `TRUST_PROXY=true` when testing behind a reverse proxy
- `NODE_ENV=production` when you need to verify production-only behavior such as secure cookies

Example:

```bash
DATABASE_PATH=./data/local-dev.db npm run dev
```

## Repository layout

The current project is organized around the Next.js App Router and a shared library layer:

- `app/` - pages, layouts, route handlers, and API endpoints
- `components/` - reusable React UI components
- `lib/` - core business logic, auth helpers, database access, notifications, and utility code
- `tests/` - Node test runner coverage for database, auth, rate limiting, CSRF, email, and settings behavior
- `data/` - local SQLite data directory
- `public/` - static assets

When adding code, place it near the feature it supports and reuse existing helpers before introducing new abstractions.

## Recommended workflow

1. Fork the repository and create a focused branch.
2. Sync with the latest default branch before starting work.
3. Make a small, reviewable change.
4. Add or update tests when behavior changes.
5. Run validation locally before opening a pull request.
6. Update docs if your change affects setup, APIs, configuration, or contributor expectations.

Favor narrow pull requests over mixed, unrelated changes. A PR that changes one behavior well is much easier to review and merge than one that touches several concerns at once.

## Coding guidelines

### Follow the existing stack and patterns

ZinaLog is already opinionated in a few important ways:

- TypeScript is enabled in `strict` mode
- Next.js App Router is the primary application structure
- shared imports may use the `@/*` path alias
- linting is handled by ESLint with Next.js core-web-vitals and TypeScript rules
- tests use the built-in Node test runner after compiling with `tsc`

Try to extend existing patterns instead of introducing a parallel style.

### Match the established code style

The codebase currently favors:

- double quotes
- semicolons
- explicit imports
- clear, descriptive names
- straightforward control flow over clever abstractions

There is no dedicated formatting script in this repository, so match the surrounding file style carefully.

### Keep server and client responsibilities clear

This app mixes server route handlers, dashboard pages, and reusable components. When contributing:

- keep API validation close to route handlers
- keep shared business logic in `lib/`
- avoid duplicating database or auth logic across routes
- preserve clear boundaries between server concerns and interactive UI concerns

### Prefer small, composable changes

Before adding a new helper, search for an existing utility that already solves the problem. Reuse is usually better than introducing another near-duplicate function.

If you are changing behavior in a route or shared library, check whether related tests or docs should change too.

### Handle errors explicitly

ZinaLog deals with authentication, API keys, logging, and alerting. Silent failures make those systems harder to trust. Prefer explicit validation, actionable error responses, and well-scoped error handling over broad catch-all behavior.

## Tests and validation

Run the relevant project checks before opening a PR:

```bash
npm run lint
npm test
npm run build
```

What these do:

- `npm run lint` checks the codebase with ESLint
- `npm test` compiles the test target and runs the Node test suite
- `npm run build` verifies that the Next.js production build succeeds

The test command writes compiled output to `.test-dist/`, which is already ignored by the lint configuration.

### When to add tests

Please add or update tests when your contribution changes:

- database behavior
- authentication or authorization logic
- API validation
- retention, alerting, rate limiting, or CSRF behavior
- reusable library logic in `lib/`

For UI-only copy or documentation changes, tests are usually not necessary unless behavior also changed.

## Documentation expectations

If your change affects contributor or operator workflows, update the relevant docs in the same pull request.

Examples:

- update `README.md` when setup, API usage, or configuration changes
- update `CONTRIBUTING.md` when the development workflow changes
- update `SECURITY.md` when the vulnerability reporting process changes

Good documentation changes are specific, current, and example-driven.

## Pull request guidance

When opening a pull request:

- use a clear title that describes the change
- explain the problem being solved
- summarize the approach you took
- note any tradeoffs or follow-up work
- include screenshots or recordings for meaningful UI changes
- mention any manual verification steps reviewers can use

If your change modifies API responses, auth flows, settings behavior, or dashboard interactions, call that out explicitly in the PR description.

## Suggested PR checklist

Before requesting review, confirm that:

- the branch contains only the intended changes
- linting, tests, and build checks pass locally
- new behavior is covered by tests when appropriate
- docs were updated if user-facing or contributor-facing behavior changed
- no secrets, tokens, or local database files were committed

## Reporting bugs and proposing changes

Bug reports are most helpful when they include:

- a short summary
- expected behavior
- actual behavior
- reproduction steps
- screenshots or logs when relevant
- environment details if the issue appears platform-specific

Feature proposals are easier to evaluate when they stay focused on a clear problem and explain why the existing workflow is not enough.

## Security and sensitive changes

Please be extra careful with contributions that affect:

- authentication and sessions
- API key handling
- CSRF protection
- rate limiting
- alert delivery credentials
- database migrations or retention behavior

Changes in these areas should include tests and a clear explanation of any security or operational impact.

Never commit secrets, real credentials, or sensitive local data.

## Community expectations

By participating in this project, you agree to follow the standards in `CODE_OF_CONDUCT.md`.

Be respectful, constructive, and specific in issues, reviews, and pull requests.

## Questions

If something in the codebase or workflow is unclear, open an issue or discussion with the smallest reproducible example or question you can provide. Clear context leads to faster, more useful feedback.

Thanks again for contributing to ZinaLog.
