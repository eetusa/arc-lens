// test/menu-checker.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { MenuChecker } from '../src/workers/menu-checker.js';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createRequire } from 'module';

// Use CommonJS require for opencv-js (works better in Node)
const require = createRequire(import.meta.url);

// OpenCV.js for Node
let cv;

// Test fixtures paths
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'screenshots');
const TEMPLATE_PATH = path.join(import.meta.dirname, '..', 'public', 'menu_header.png');

// Helper: Load PNG as RGBA buffer
function loadPNG(filePath) {
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    return {
        data: new Uint8ClampedArray(png.data),
        width: png.width,
        height: png.height
    };
}

// Helper: Create OpenCV Mat from PNG data
function pngToMat(cv, pngData) {
    const mat = new cv.Mat(pngData.height, pngData.width, cv.CV_8UC4);
    mat.data.set(pngData.data);
    return mat;
}

// Test case definitions - add your test images here
const TEST_CASES = [
    // Format: { file: 'filename.png', resolution: '1080p', expectedOpen: true/false, description: 'what this tests' }
    // Base menu scenarios
    { file: '1080p-menu-open.png', resolution: '1080p', expectedOpen: true, description: '1080p with menu open' },
    { file: '1080p-menu-closed.png', resolution: '1080p', expectedOpen: false, description: '1080p with menu closed' },
    { file: '1440p-menu-open.png', resolution: '1440p', expectedOpen: true, description: '1440p with menu open' },
    { file: '1440p-menu-closed.png', resolution: '1440p', expectedOpen: false, description: '1440p with menu closed' },
    // In-raid scenarios
    { file: '1080p-in-raid-menu-open.png', resolution: '1080p', expectedOpen: true, description: '1080p in-raid with menu open' },
    { file: '1080p-in-raid-menu-closed.png', resolution: '1080p', expectedOpen: false, description: '1080p in-raid with menu closed' },
    { file: '1080p-in-raid-2-menu-closed.png', resolution: '1080p', expectedOpen: false, description: '1080p in-raid-2 with menu closed' },
    { file: '1440p-in-raid-menu-open.png', resolution: '1440p', expectedOpen: true, description: '1440p in-raid with menu open' },
    { file: '1440p-in-raid-menu-closed.png', resolution: '1440p', expectedOpen: false, description: '1440p in-raid with menu closed' },
    { file: '1440p-in-raid-2-menu-closed.png', resolution: '1440p', expectedOpen: false, description: '1440p in-raid-2 with menu closed' },
];

describe('MenuChecker', () => {
    let menuChecker;
    let templateMat;

    beforeAll(async () => {
        // Load OpenCV.js using CommonJS require (more reliable in Node)
        cv = require('@techstark/opencv-js');

        // Wait for OpenCV to be ready
        await new Promise((resolve) => {
            if (cv.Mat) {
                resolve();
            } else {
                cv.onRuntimeInitialized = resolve;
            }
        });

        // Load template
        const templatePng = loadPNG(TEMPLATE_PATH);
        templateMat = pngToMat(cv, templatePng);

        // Initialize MenuChecker
        menuChecker = new MenuChecker();
        menuChecker.init(cv, templateMat);

        console.log(`Template loaded: ${templatePng.width}x${templatePng.height}`);
        console.log(`MenuChecker ready: ${menuChecker.ready}`);
    });

    it('should initialize correctly', () => {
        expect(menuChecker.ready).toBe(true);
    });

    it('should have correct default configuration', () => {
        expect(menuChecker.MATCH_THRESHOLD).toBe(0.30);
        expect(menuChecker.PILL_ASPECT_RATIO_MIN).toBe(2.0);
        expect(menuChecker.PILL_WIDTH_MIN).toBe(60);
    });

    // Dynamic test generation for each test image
    describe('Resolution Tests', () => {
        for (const testCase of TEST_CASES) {
            const testFilePath = path.join(FIXTURES_DIR, testCase.file);

            it(`should detect menu state correctly for ${testCase.description}`, async () => {
                // Skip if file doesn't exist yet
                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    return;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                console.log(`Testing ${testCase.file}: ${png.width}x${png.height}`);

                const result = menuChecker.check(cv, frameMat);

                console.log(`  Result: isOpen=${result.isOpen}, score=${result.score?.toFixed(3)}`);

                // Clean up
                frameMat.delete();

                // Verify
                expect(result.isOpen).toBe(testCase.expectedOpen);
            });
        }
    });

    // Score reporting test - runs all available images and reports scores
    describe('Score Analysis', () => {
        it('should report scores for all available test images', () => {
            const results = [];

            for (const testCase of TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    results.push({ ...testCase, status: 'MISSING' });
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const result = menuChecker.check(cv, frameMat);
                frameMat.delete();

                const passed = result.isOpen === testCase.expectedOpen;
                results.push({
                    ...testCase,
                    status: passed ? 'PASS' : 'FAIL',
                    actualOpen: result.isOpen,
                    score: result.score
                });
            }

            // Print summary table
            console.log('\n=== MenuChecker Test Results ===');
            console.log('File                      | Expected | Actual | Score  | Status');
            console.log('-'.repeat(70));

            for (const r of results) {
                if (r.status === 'MISSING') {
                    console.log(`${r.file.padEnd(25)} | ${String(r.expectedOpen).padEnd(8)} | ${'N/A'.padEnd(6)} | ${'N/A'.padEnd(6)} | MISSING`);
                } else {
                    console.log(`${r.file.padEnd(25)} | ${String(r.expectedOpen).padEnd(8)} | ${String(r.actualOpen).padEnd(6)} | ${r.score?.toFixed(3).padEnd(6)} | ${r.status}`);
                }
            }

            // This test always passes - it's for reporting
            expect(true).toBe(true);
        });
    });
});
