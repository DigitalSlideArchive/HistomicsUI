import {cpus, totalmem} from 'os';

import {defineConfig, devices} from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.  This follows the
 * configuration used by Girder 5 (girder/web/playwright.config.ts).
 */
export default defineConfig({
    testDir: './tests',
    /* Test (and hook) timeout.  This is intentionally larger than the expect
     * timeout so that a slow assertion failure or a slow server startup does
     * not consume the entire budget. */
    timeout: 90000,
    /* Default timeout for expect() assertions.  Tests should rely on this
     * rather than passing explicit timeouts, so slow CI runners don't cause
     * flaky failures. */
    expect: {
        timeout: 20000
    },
    fullyParallel: false,
    /* Fail the build on CI if test.only is in the source code. */
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : (parseInt(process.env.PLAYWRIGHT_RETRIES ?? '') || 0),
    workers: (() => {
        if (process.env.PLAYWRIGHT_WORKERS) {
            return parseInt(process.env.PLAYWRIGHT_WORKERS);
        }
        if (process.env.CI) {
            return 1;
        }
        // Each worker runs its own Girder server; limit workers by memory.
        const memoryLimiter = Math.floor(totalmem() / (4 * 1024 ** 3));
        return Math.max(1, Math.min(cpus().length, memoryLimiter));
    })(),
    reporter: [
        ['line'],
        ['html', {open: 'never'}]
    ],
    globalSetup: './tests/playwright-setup.ts',
    globalTeardown: './tests/playwright-teardown.ts',
    use: {
        actionTimeout: 30000,
        trace: 'on-first-retry',
        /* Set HEADLESS=false to watch the tests run. */
        headless: process.env.HEADLESS !== 'false',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {...devices['Desktop Chrome']}
        }
    ]
});
