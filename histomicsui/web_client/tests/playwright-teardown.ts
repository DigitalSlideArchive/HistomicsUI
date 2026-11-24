import fs from 'fs/promises';

import type {FullConfig} from '@playwright/test';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

// Merge the per-test coverage data written by coverage.ts into an HTML report
// (coverage/report) and a cobertura XML file that CI uploads alongside the
// python coverage.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async (_config: FullConfig) => {
    const coverageMap = libCoverage.createCoverageMap({});
    let files: string[] = [];
    try {
        files = await fs.readdir('coverage/data');
    } catch (e) {
        // no coverage was collected
    }
    console.log(`Found coverage files: ${files.length}`);
    for (const file of files) {
        coverageMap.merge(JSON.parse((await fs.readFile(`coverage/data/${file}`)).toString()));
    }

    const watermarks = {
        statements: [50, 80] as [number, number],
        functions: [50, 80] as [number, number],
        branches: [50, 80] as [number, number],
        lines: [50, 80] as [number, number]
    };
    const htmlContext = libReport.createContext({
        dir: 'coverage/report',
        defaultSummarizer: 'nested',
        watermarks,
        coverageMap
    });
    reports.create('html', {skipEmpty: false}).execute(htmlContext);

    const outputDir = process.env.GIRDER_TEST_COVERAGE_DIR || '../../.tox/coverage';
    await fs.mkdir(outputDir, {recursive: true});
    const xmlContext = libReport.createContext({
        dir: outputDir,
        defaultSummarizer: 'nested',
        coverageMap
    });
    reports.create('cobertura', {
        file: process.env.GIRDER_TEST_COVERAGE_FILE || 'cobertura-coverage.xml'
    }).execute(xmlContext);
};
