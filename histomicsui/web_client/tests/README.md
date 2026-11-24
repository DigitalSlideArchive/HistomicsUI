# HistomicsUI web client tests

These are [Playwright](https://playwright.dev) tests, structured the same way
as the Girder 5 web client tests (`girder/web/tests` in the Girder repository).

- `server.ts` starts a `girder serve` process with a fresh database for each
  `test.describe` block that calls `setupServer()`, and navigates each test to
  the Girder web client.
- `util.ts` has generic Girder helpers (`login`, `createUser`, `waitForDialog`,
  `waitForIdlePage`, ...).
- `hui.ts` has HistomicsUI helpers: `setupResources` creates the users, images,
  annotation and config folder that the specs rely on through the REST API;
  `gotoHistomics`, `huiLogin`, and `openImage` drive the HistomicsUI app; and
  `evalApp` runs code in the page with the app instance (exposed as
  `window.histomicsApp`).
- `coverage.ts` converts chromium's V8 coverage of the built bundles back to
  the source files via their source maps; `playwright-teardown.ts` merges it
  into `coverage/report` (HTML) and a cobertura XML for CI.
- `spec/*.spec.ts` are the tests and `data/` holds test files.

Run them with `tox -e webtest`, or from this directory with `npx playwright
test` (the `girder` executable and a MongoDB at
`$GIRDER_CLIENT_TESTING_MONGO_URI`, default `mongodb://localhost:27017`, must
be available).  The client must be built first (`npm run build`).  Set
`HEADLESS=false` to watch the browser.
