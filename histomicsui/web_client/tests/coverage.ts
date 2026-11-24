import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import {fileURLToPath} from 'url';

import v8toIstanbul from 'v8-to-istanbul';
import libCoverage from 'istanbul-lib-coverage';
import type {Page} from '@playwright/test';

// Coverage of the HistomicsUI client is collected from chromium's V8 coverage
// and converted to istanbul format, using the source maps emitted by the vite
// build.  Only files that belong to this package (the standalone app in
// `dist-app` and the Girder plugin bundle in `dist`) are converted; other
// plugins' bundles are ignored.  The per-test results are merged into a single
// report in playwright-teardown.ts.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webClientDir = path.resolve(__dirname, '..');

const createId = (length: number) => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i += 1) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

/**
 * Map a URL that chromium reported coverage for to a local built file, or
 * return null if it isn't one of ours.
 */
const localPathForUrl = (url: string): string | null => {
    let pathname: string;
    try {
        pathname = new URL(url).pathname;
    } catch (e) {
        return null;
    }
    const filename = path.basename(pathname);
    if (!filename.endsWith('.js')) {
        return null;
    }
    const candidates: string[] = [];
    if (pathname.includes('/plugin_static/')) {
        candidates.push(path.join(webClientDir, 'dist', filename));
    } else if (pathname.includes('/assets/')) {
        candidates.push(path.join(webClientDir, 'dist-app', 'assets', filename));
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
};

export const startCoverage = async (page: Page) => {
    try {
        await page.coverage.startJSCoverage({resetOnNavigation: false});
    } catch (e) {
        // Coverage is only supported on chromium.
    }
};

export const outputCoverageReport = async (page: Page) => {
    let coverage;
    try {
        coverage = await page.coverage.stopJSCoverage();
    } catch (e) {
        return;
    }
    const coverageMap = libCoverage.createCoverageMap({});
    for (const entry of coverage) {
        const localPath = localPathForUrl(entry.url);
        if (!localPath) {
            continue;
        }
        try {
            // Pass the source map explicitly; letting v8-to-istanbul discover
            // it fails on bundles that embed a sourceMappingURL comment in a
            // string literal.
            let sourceMap;
            if (fs.existsSync(`${localPath}.map`)) {
                sourceMap = {sourcemap: JSON.parse(fs.readFileSync(`${localPath}.map`, 'utf8'))};
            }
            const converter = v8toIstanbul(
                localPath, 0, {source: entry.source ?? '', sourceMap},
                (filePath) => filePath.includes('node_modules') || filePath.includes('/vendor/'));
            await converter.load();
            converter.applyCoverage(entry.functions);
            coverageMap.merge(converter.toIstanbul());
        } catch (e) {
            console.error(`Could not convert coverage for ${entry.url}: ${e}`);
        }
    }
    if (Object.keys(coverageMap.data).length) {
        await fsp.mkdir('coverage/data', {recursive: true});
        await fsp.writeFile(`coverage/data/coverage-${createId(8)}.json`, JSON.stringify(coverageMap));
    }
};
