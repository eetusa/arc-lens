// test/main-menu-checker.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { MainMenuChecker } from '../src/workers/main-menu-checker.js';
import { PlayTabChecker } from '../src/workers/play-tab-checker.js';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let cv;

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'screenshots');

function loadPNG(filePath) {
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    return {
        data: new Uint8ClampedArray(png.data),
        width: png.width,
        height: png.height
    };
}

function pngToMat(cv, pngData) {
    const mat = new cv.Mat(pngData.height, pngData.width, cv.CV_8UC4);
    mat.data.set(pngData.data);
    return mat;
}

// Test cases for main menu detection (rainbow stripes)
const MAIN_MENU_TEST_CASES = [
    // Main menu screenshots (should detect rainbow stripes)
    { file: '1080p/main-menu-play.png', expectedMainMenu: true, expectedPlayTab: true, description: '1080p main menu - PLAY tab' },
    { file: '1080p/main-menu-not-play-1.png', expectedMainMenu: true, expectedPlayTab: false, description: '1080p main menu - STORE tab' },
    { file: '1080p/main-menu-not-play-2.png', expectedMainMenu: true, expectedPlayTab: false, description: '1080p main menu - WORKSHOP tab' },
    { file: '1080p/main-menu-not-play-3.png', expectedMainMenu: true, expectedPlayTab: false, description: '1080p main menu - TRADERS tab' },
    { file: '1440p/main-menu-play.png', expectedMainMenu: true, expectedPlayTab: true, description: '1440p main menu - PLAY tab' },
    { file: '1440p/main-menu-not-play-1.png', expectedMainMenu: true, expectedPlayTab: false, description: '1440p main menu - STORE tab' },
    { file: '1440p/main-menu-not-play-2.png', expectedMainMenu: true, expectedPlayTab: false, description: '1440p main menu - WORKSHOP tab' },
    { file: '1440p/main-menu-not-play-3.png', expectedMainMenu: true, expectedPlayTab: false, description: '1440p main menu - TRADERS tab' },
    // In-raid screenshots (should NOT detect rainbow stripes)
    { file: '1080p/in-raid-menu-open.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p in-raid menu open' },
    { file: '1080p/in-raid-menu-closed.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p in-raid menu closed' },
    { file: '1080p/in-raid-2-menu-closed.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p in-raid-2 menu closed' },
    { file: '1440p/in-raid-menu-open.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p in-raid menu open' },
    { file: '1440p/in-raid-menu-closed.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p in-raid menu closed' },
    { file: '1440p/in-raid-2-menu-closed.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p in-raid-2 menu closed' },
    // Inventory menu screenshots (should NOT detect rainbow stripes)
    { file: '1080p/menu-open.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p inventory screen' },
    { file: '1440p/menu-open.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p inventory screen' },
    // Main menu with PLAY tab (menu-closed screenshots are PLAY tab)
    { file: '1080p/menu-closed.png', expectedMainMenu: true, expectedPlayTab: true, description: '1080p main menu PLAY tab' },
    { file: '1440p/menu-closed.png', expectedMainMenu: true, expectedPlayTab: true, description: '1440p main menu PLAY tab' },
    // Item tooltip screenshots (should NOT detect rainbow stripes)
    { file: '1080p/anvil_I.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p item tooltip - Anvil I' },
    { file: '1080p/stitcher_II.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p item tooltip - Stitcher II' },
    { file: '1080p/compensator_I.png', expectedMainMenu: false, expectedPlayTab: false, description: '1080p item tooltip - Compensator I' },
    { file: '1440p/anvil_I.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p item tooltip - Anvil I' },
    { file: '1440p/stitcher_I.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p item tooltip - Stitcher I' },
    { file: '1440p/compensator_I.png', expectedMainMenu: false, expectedPlayTab: false, description: '1440p item tooltip - Compensator I' },
];

describe('MainMenuChecker', () => {
    let mainMenuChecker;

    beforeAll(async () => {
        cv = require('@techstark/opencv-js');
        await new Promise((resolve) => {
            if (cv.Mat) resolve();
            else cv.onRuntimeInitialized = resolve;
        });

        mainMenuChecker = new MainMenuChecker();
        mainMenuChecker.init(cv);

        console.log(`MainMenuChecker ready: ${mainMenuChecker.ready}`);
    });

    it('should initialize correctly', () => {
        expect(mainMenuChecker.ready).toBe(true);
    });

    describe('Rainbow Stripe Detection', () => {
        for (const testCase of MAIN_MENU_TEST_CASES) {
            const testFilePath = path.join(FIXTURES_DIR, testCase.file);

            it(`should detect main menu for ${testCase.description}`, async () => {
                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    return;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                const result = mainMenuChecker.check(cv, frameMat);

                console.log(`  ${testCase.file}: isMainMenu=${result.isMainMenu}, colors=${result.detectedColors}, counts=${JSON.stringify(result.colorCounts)}`);

                frameMat.delete();

                expect(result.isMainMenu).toBe(testCase.expectedMainMenu);
            });
        }
    });

    describe('Score Analysis', () => {
        it('should report detection results for all test images', () => {
            const results = [];

            for (const testCase of MAIN_MENU_TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    results.push({ ...testCase, status: 'MISSING' });
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const result = mainMenuChecker.check(cv, frameMat);
                frameMat.delete();

                const passed = result.isMainMenu === testCase.expectedMainMenu;
                results.push({
                    ...testCase,
                    status: passed ? 'PASS' : 'FAIL',
                    actualMainMenu: result.isMainMenu,
                    detectedColors: result.detectedColors,
                    colorCounts: result.colorCounts
                });
            }

            console.log('\n=== MainMenuChecker Test Results ===');
            console.log('File                              | Expected | Actual | Colors | Status');
            console.log('-'.repeat(80));

            for (const r of results) {
                if (r.status === 'MISSING') {
                    console.log(`${r.file.padEnd(33)} | ${String(r.expectedMainMenu).padEnd(8)} | ${'N/A'.padEnd(6)} | ${'N/A'.padEnd(6)} | MISSING`);
                } else {
                    console.log(`${r.file.padEnd(33)} | ${String(r.expectedMainMenu).padEnd(8)} | ${String(r.actualMainMenu).padEnd(6)} | ${String(r.detectedColors).padEnd(6)} | ${r.status}`);
                }
            }

            expect(true).toBe(true);
        });
    });
});

describe('PlayTabChecker', () => {
    let playTabChecker;

    beforeAll(async () => {
        cv = require('@techstark/opencv-js');
        await new Promise((resolve) => {
            if (cv.Mat) resolve();
            else cv.onRuntimeInitialized = resolve;
        });

        playTabChecker = new PlayTabChecker();
        playTabChecker.init(cv);

        console.log(`PlayTabChecker ready: ${playTabChecker.ready}`);
    });

    it('should initialize correctly', () => {
        expect(playTabChecker.ready).toBe(true);
    });

    describe('PLAY Tab Detection', () => {
        // Only test main menu images for play tab detection
        const playTabTests = MAIN_MENU_TEST_CASES.filter(tc => tc.expectedMainMenu);

        for (const testCase of playTabTests) {
            const testFilePath = path.join(FIXTURES_DIR, testCase.file);

            it(`should detect PLAY tab for ${testCase.description}`, async () => {
                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    return;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                const result = playTabChecker.check(cv, frameMat);

                console.log(`  ${testCase.file}: isPlayTab=${result.isPlayTab}, yellowPercent=${((result.yellowPercent || 0) * 100).toFixed(1)}%`);

                frameMat.delete();

                expect(result.isPlayTab).toBe(testCase.expectedPlayTab);
            });
        }
    });

    describe('Score Analysis', () => {
        it('should report detection results for all main menu images', () => {
            const results = [];
            const playTabTests = MAIN_MENU_TEST_CASES.filter(tc => tc.expectedMainMenu);

            for (const testCase of playTabTests) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    results.push({ ...testCase, status: 'MISSING' });
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const result = playTabChecker.check(cv, frameMat);
                frameMat.delete();

                const passed = result.isPlayTab === testCase.expectedPlayTab;
                results.push({
                    ...testCase,
                    status: passed ? 'PASS' : 'FAIL',
                    actualPlayTab: result.isPlayTab,
                    yellowPercent: ((result.yellowPercent || 0) * 100).toFixed(1)
                });
            }

            console.log('\n=== PlayTabChecker Test Results ===');
            console.log('File                              | Expected | Actual | Yellow % | Status');
            console.log('-'.repeat(80));

            for (const r of results) {
                if (r.status === 'MISSING') {
                    console.log(`${r.file.padEnd(33)} | ${String(r.expectedPlayTab).padEnd(8)} | ${'N/A'.padEnd(6)} | ${'N/A'.padEnd(8)} | MISSING`);
                } else {
                    console.log(`${r.file.padEnd(33)} | ${String(r.expectedPlayTab).padEnd(8)} | ${String(r.actualPlayTab).padEnd(6)} | ${(r.yellowPercent + '%').padEnd(8)} | ${r.status}`);
                }
            }

            expect(true).toBe(true);
        });
    });
});
