// test/ocr-pipeline.test.js
// End-to-end OCR pipeline tests: crop → OCR → item matching
import { describe, it, expect, beforeAll } from 'vitest';
import { TooltipFinder } from '../src/workers/tooltip-finder.js';
import { findBestMatch } from '../src/logic/string-utils.js';
import * as ort from 'onnxruntime-web';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let cv;
let ocrSession = null;
let vocab = [];

// Test fixtures paths
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'screenshots');
const MODEL_PATH = path.join(import.meta.dirname, '..', 'public', 'en_PP-OCRv4_rec_infer.onnx');
const VOCAB_PATH = path.join(import.meta.dirname, '..', 'public', 'en_dict.txt');
const ITEMS_DB_PATH = path.join(import.meta.dirname, '..', 'public', 'items_db.json');

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

// Preprocess image for PaddleOCR
// Improved settings: 72px height and no erosion for better Roman numeral recognition across resolutions
function preprocessForPaddle(cv, srcMat, options = {}) {
    const targetH = options.targetH || 72;  // 72px works best for both 1080p and 1440p
    const minW = options.minW || 320;
    const stretchFactor = options.stretchFactor || 1.2;
    const useErosion = options.useErosion === true; // default false (was true)
    const erosionSize = options.erosionSize || 2;

    // 1. GRAYSCALE
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    let processed = gray;

    // THINNING (EROSION) - optional
    if (useErosion && erosionSize > 0) {
        let eroded = new cv.Mat();
        let M = cv.Mat.ones(erosionSize, erosionSize, cv.CV_8U);
        cv.erode(gray, eroded, M, new cv.Point(-1, -1), 1);
        M.delete();
        gray.delete();
        processed = eroded;
    }

    // 2. INVERT
    let inverted = new cv.Mat();
    cv.bitwise_not(processed, inverted);
    processed.delete();

    // 3. STRETCH
    const ratio = inverted.cols / inverted.rows;
    let newW = Math.floor(targetH * ratio * stretchFactor);

    // 4. RESIZE
    let resized = new cv.Mat();
    cv.resize(inverted, resized, new cv.Size(newW, targetH), 0, 0, cv.INTER_LINEAR);

    // 5. PAD
    const padW = Math.max(minW, newW);
    let padded = new cv.Mat(targetH, padW, cv.CV_8UC1, new cv.Scalar(255));
    let roi = padded.roi(new cv.Rect(0, 0, newW, targetH));
    resized.copyTo(roi);

    // Cleanup
    inverted.delete();
    roi.delete();
    resized.delete();

    // 6. TENSOR
    const count = padW * targetH;
    const floatArr = new Float32Array(3 * count);
    const data = padded.data;

    for (let i = 0; i < count; i++) {
        let val = data[i];
        const norm = (val / 127.5) - 1.0;
        floatArr[i] = norm;
        floatArr[count + i] = norm;
        floatArr[2 * count + i] = norm;
    }

    padded.delete();
    return new ort.Tensor('float32', floatArr, [1, 3, targetH, padW]);
}

// Decode ONNX output to text (from vision.worker.js)
function decodeTensorOutput(outputData, dims, vocab) {
    const [batch, timeStep, vocabSize] = dims;
    let sb = [];
    let prevIndex = -1;

    for (let t = 0; t < timeStep; t++) {
        let maxVal = -Infinity;
        let maxIdx = 0;
        const offset = t * vocabSize;

        for (let v = 0; v < vocabSize; v++) {
            const val = outputData[offset + v];
            if (val > maxVal) { maxVal = val; maxIdx = v; }
        }

        if (maxIdx !== prevIndex && maxIdx !== 0 && maxIdx !== (vocabSize - 1)) {
            if (vocab[maxIdx]) sb.push(vocab[maxIdx]);
        }
        prevIndex = maxIdx;
    }
    return sb.join('');
}

// Extract header ROI from tooltip crop (same logic as vision.worker.js)
function extractHeaderROI(cv, crop) {
    const rows = crop.rows;
    const cols = crop.cols;

    // Strict ROI Calculation
    const topRatio = 0.11;
    let rawStart = Math.floor(cols * topRatio);
    const minHeightCut = Math.floor(rows * 0.04);
    const maxHeightCut = Math.floor(rows * 0.25);
    const yStart = Math.min(Math.max(rawStart, minHeightCut), maxHeightCut);
    const bottomRatio = 0.21;
    let yEnd = Math.floor(cols * bottomRatio);
    yEnd = Math.min(yEnd, rows);
    if (yEnd < yStart + 15) yEnd = Math.min(yStart + 15, rows);

    const roiHeight = yEnd - yStart;
    const xStart = Math.floor(cols * 0.05);
    const roiWidth = Math.floor(cols * 0.90);

    if (roiHeight <= 0 || roiWidth <= 0) {
        return null;
    }

    const headerRect = new cv.Rect(xStart, yStart, roiWidth, roiHeight);
    const headerRoiWindow = crop.roi(headerRect);
    const headerRoi = headerRoiWindow.clone();
    headerRoiWindow.delete();

    return headerRoi;
}

// Test case definitions - filename maps to expected item name
// Files are organized in resolution subfolders: 1080p/ and 1440p/
// Format: { file: 'resolution/filename.png', expectedItem: 'Item Name' }
const TEST_CASES = [
    // === 1440p Resolution ===
    // Anvil variants
    { file: '1440p/anvil_I.png', expectedItem: 'Anvil I' },
    { file: '1440p/anvil_II.png', expectedItem: 'Anvil II' },
    { file: '1440p/anvil_III.png', expectedItem: 'Anvil III' },
    // Stitcher variants (note typos in some filenames)
    { file: '1440p/stitcher_I.png', expectedItem: 'Stitcher I' },
    { file: '1440p/sticher_II.png', expectedItem: 'Stitcher II' },  // typo in filename
    { file: '1440p/sticher_III.png', expectedItem: 'Stitcher III' }, // typo in filename
    { file: '1440p/stitcher_IV.png', expectedItem: 'Stitcher IV' },
    // Attachments
    { file: '1440p/muzzle_brake_II.png', expectedItem: 'Muzzle Brake II' },
    { file: '1440p/compensator_I.png', expectedItem: 'Compensator I' },
    { file: '1440p/compensator_II.png', expectedItem: 'Compensator II' },
    { file: '1440p/vertical_grip_II.png', expectedItem: 'Vertical Grip II' },
    { file: '1440p/angled_grip_II.png', expectedItem: 'Angled Grip II' },
    // Backpacks
    { file: '1440p/looting_mk_1.png', expectedItem: 'Looting Mk. 1' },
    { file: '1440p/looting_mk_2.png', expectedItem: 'Looting Mk. 2' },

    // === 1080p Resolution ===
    // Anvil variants
    { file: '1080p/anvil_I.png', expectedItem: 'Anvil I' },
    { file: '1080p/anvil_II.png', expectedItem: 'Anvil II' },
    { file: '1080p/anvil_III.png', expectedItem: 'Anvil III' },
    // Stitcher variants (note typos in some filenames)
    { file: '1080p/sticher_I.png', expectedItem: 'Stitcher I' },  // typo in filename
    { file: '1080p/stitcher_II.png', expectedItem: 'Stitcher II' },
    { file: '1080p/stitcher_III.png', expectedItem: 'Stitcher III' },
    // Attachments
    { file: '1080p/muzzle_brake_II.png', expectedItem: 'Muzzle Brake II' },
    { file: '1080p/compensator_I.png', expectedItem: 'Compensator I' },
    { file: '1080p/vertical_grip_II.png', expectedItem: 'Vertical Grip II' },
    { file: '1080p/extended_light_mag_II.png', expectedItem: 'Extended Light Mag II' },
    { file: '1080p/stable_stock_I.png', expectedItem: 'Stable Stock I' },
    // Backpacks
    { file: '1080p/looting_mk_1.png', expectedItem: 'Looting Mk. 1' },
    { file: '1080p/looting_mk_2.png', expectedItem: 'Looting Mk. 2' },
];

describe('OCR Pipeline End-to-End', () => {
    let allItemNames = [];

    beforeAll(async () => {
        // 1. Load OpenCV.js
        cv = require('@techstark/opencv-js');
        await new Promise((resolve) => {
            if (cv.Mat) {
                resolve();
            } else {
                cv.onRuntimeInitialized = resolve;
            }
        });

        // 2. Load ONNX model
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.simd = true;

        ocrSession = await ort.InferenceSession.create(MODEL_PATH, {
            executionProviders: ['wasm']
        });

        // 3. Load vocabulary
        const vocabText = fs.readFileSync(VOCAB_PATH, 'utf-8');
        vocab = vocabText.split(/\r?\n/);

        // 4. Load item database for matching
        const itemsData = JSON.parse(fs.readFileSync(ITEMS_DB_PATH, 'utf-8'));
        if (Array.isArray(itemsData)) {
            allItemNames = itemsData.map(i => i.name);
        } else {
            allItemNames = Object.values(itemsData).map(i => i.name);
        }

        console.log(`Loaded ${allItemNames.length} item names for matching`);
        console.log(`ONNX model loaded: ${ocrSession !== null}`);
        console.log(`Vocabulary size: ${vocab.length}`);
    });

    it('should initialize all dependencies', () => {
        expect(cv).toBeDefined();
        expect(cv.Mat).toBeDefined();
        expect(ocrSession).not.toBeNull();
        expect(vocab.length).toBeGreaterThan(0);
        expect(allItemNames.length).toBeGreaterThan(0);
    });

    describe('Item Recognition Tests', () => {
        for (const testCase of TEST_CASES) {
            const testFilePath = path.join(FIXTURES_DIR, testCase.file);

            it(`should recognize "${testCase.expectedItem}" from ${testCase.file}`, async () => {
                // Skip if file doesn't exist
                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    return;
                }

                // 1. Load image
                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                // 2. Find tooltip
                const tooltipResult = TooltipFinder.findTooltip(cv, frameMat);
                expect(tooltipResult.found).toBe(true);

                if (!tooltipResult.found) {
                    frameMat.delete();
                    return;
                }

                const crop = tooltipResult.crop;

                // 3. Extract header ROI
                const headerRoi = extractHeaderROI(cv, crop);
                expect(headerRoi).not.toBeNull();

                if (!headerRoi) {
                    crop.delete();
                    frameMat.delete();
                    return;
                }

                // 4. Preprocess for OCR
                const inputTensor = preprocessForPaddle(cv, headerRoi);

                // 5. Run OCR
                const feeds = { x: inputTensor };
                const results = await ocrSession.run(feeds);
                const outputKey = ocrSession.outputNames[0];
                const outputTensor = results[outputKey];

                // 6. Decode output
                const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab);
                const cleanText = rawText.trim();

                console.log(`  ${testCase.file}: OCR raw text = "${cleanText}"`);

                // 7. Match against item database
                const matchedItem = findBestMatch(cleanText, allItemNames);

                console.log(`  ${testCase.file}: Matched item = "${matchedItem}"`);

                // Cleanup
                headerRoi.delete();
                crop.delete();
                frameMat.delete();

                // 8. Verify
                expect(matchedItem).toBe(testCase.expectedItem);
            });
        }
    });

    // Summary test - runs all and reports results
    describe('Summary Report', () => {
        it('should report results for all test images', async () => {
            const results = [];

            for (const testCase of TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    results.push({
                        ...testCase,
                        status: 'MISSING',
                        rawText: null,
                        matchedItem: null
                    });
                    continue;
                }

                try {
                    // Full pipeline
                    const png = loadPNG(testFilePath);
                    const frameMat = pngToMat(cv, png);
                    const tooltipResult = TooltipFinder.findTooltip(cv, frameMat);

                    if (!tooltipResult.found) {
                        frameMat.delete();
                        results.push({
                            ...testCase,
                            status: 'NO_TOOLTIP',
                            rawText: null,
                            matchedItem: null
                        });
                        continue;
                    }

                    const crop = tooltipResult.crop;
                    const headerRoi = extractHeaderROI(cv, crop);

                    if (!headerRoi) {
                        crop.delete();
                        frameMat.delete();
                        results.push({
                            ...testCase,
                            status: 'NO_HEADER',
                            rawText: null,
                            matchedItem: null
                        });
                        continue;
                    }

                    const inputTensor = preprocessForPaddle(cv, headerRoi);
                    const feeds = { x: inputTensor };
                    const ocrResults = await ocrSession.run(feeds);
                    const outputKey = ocrSession.outputNames[0];
                    const outputTensor = ocrResults[outputKey];
                    const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab).trim();
                    const matchedItem = findBestMatch(rawText, allItemNames);

                    headerRoi.delete();
                    crop.delete();
                    frameMat.delete();

                    const passed = matchedItem === testCase.expectedItem;
                    results.push({
                        ...testCase,
                        status: passed ? 'PASS' : 'FAIL',
                        rawText,
                        matchedItem
                    });
                } catch (e) {
                    results.push({
                        ...testCase,
                        status: 'ERROR',
                        rawText: null,
                        matchedItem: null,
                        error: e.message
                    });
                }
            }

            // Print summary table
            console.log('\n=== OCR Pipeline Test Results ===');
            console.log('File                      | Expected            | OCR Raw             | Matched             | Status');
            console.log('-'.repeat(100));

            for (const r of results) {
                const file = r.file.padEnd(25);
                const expected = (r.expectedItem || 'N/A').padEnd(19);
                const raw = (r.rawText || 'N/A').substring(0, 19).padEnd(19);
                const matched = (r.matchedItem || 'N/A').padEnd(19);
                console.log(`${file} | ${expected} | ${raw} | ${matched} | ${r.status}`);
            }

            // Count results
            const passed = results.filter(r => r.status === 'PASS').length;
            const failed = results.filter(r => r.status === 'FAIL').length;
            const missing = results.filter(r => r.status === 'MISSING').length;
            const errors = results.filter(r => ['NO_TOOLTIP', 'NO_HEADER', 'ERROR'].includes(r.status)).length;

            console.log('-'.repeat(100));
            console.log(`Total: ${results.length} | Pass: ${passed} | Fail: ${failed} | Missing: ${missing} | Errors: ${errors}`);

            // This test always passes - it's for reporting
            expect(true).toBe(true);
        });
    });

    // Experimental: Test different preprocessing options on failing case
    describe('Preprocessing Experiments', () => {
        const PREPROCESS_OPTIONS = [
            { name: '56px', targetH: 56, useErosion: false },
            { name: '60px', targetH: 60, useErosion: false },
            { name: '64px', targetH: 64, useErosion: false },
            { name: '68px', targetH: 68, useErosion: false },
            { name: '72px', targetH: 72, useErosion: false },
        ];

        it('should find best preprocessing for Stitcher III', async () => {
            const testFile = '1440p/sticher_III.png';
            const expectedItem = 'Stitcher III';
            const testFilePath = path.join(FIXTURES_DIR, testFile);

            if (!fs.existsSync(testFilePath)) {
                console.log(`Skipping: ${testFile} not found`);
                return;
            }

            console.log('\n=== Preprocessing Experiments for Stitcher III ===');
            console.log('Option                          | OCR Raw             | Matched             | Result');
            console.log('-'.repeat(95));

            for (const opts of PREPROCESS_OPTIONS) {
                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const tooltipResult = TooltipFinder.findTooltip(cv, frameMat);

                if (!tooltipResult.found) {
                    frameMat.delete();
                    console.log(`${opts.name.padEnd(31)} | ${'NO_TOOLTIP'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const crop = tooltipResult.crop;
                const headerRoi = extractHeaderROI(cv, crop);

                if (!headerRoi) {
                    crop.delete();
                    frameMat.delete();
                    console.log(`${opts.name.padEnd(31)} | ${'NO_HEADER'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const inputTensor = preprocessForPaddle(cv, headerRoi, opts);
                const feeds = { x: inputTensor };
                const ocrResults = await ocrSession.run(feeds);
                const outputKey = ocrSession.outputNames[0];
                const outputTensor = ocrResults[outputKey];
                const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab).trim();
                const matchedItem = findBestMatch(rawText, allItemNames);

                headerRoi.delete();
                crop.delete();
                frameMat.delete();

                const passed = matchedItem === expectedItem;
                console.log(`${opts.name.padEnd(31)} | ${rawText.substring(0, 19).padEnd(19)} | ${(matchedItem || 'null').padEnd(19)} | ${passed ? 'PASS' : 'FAIL'}`);
            }

            console.log('-'.repeat(95));
            expect(true).toBe(true);
        });

        it('should find best preprocessing for 1080p Anvil III', async () => {
            const testFile = '1080p/anvil_III.png';
            const expectedItem = 'Anvil III';
            const testFilePath = path.join(FIXTURES_DIR, testFile);

            if (!fs.existsSync(testFilePath)) {
                console.log(`Skipping: ${testFile} not found`);
                return;
            }

            console.log('\n=== Preprocessing Experiments for 1080p Anvil III ===');
            console.log('Option                          | OCR Raw             | Matched             | Result');
            console.log('-'.repeat(95));

            for (const opts of PREPROCESS_OPTIONS) {
                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const tooltipResult = TooltipFinder.findTooltip(cv, frameMat);

                if (!tooltipResult.found) {
                    frameMat.delete();
                    console.log(`${opts.name.padEnd(31)} | ${'NO_TOOLTIP'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const crop = tooltipResult.crop;
                const headerRoi = extractHeaderROI(cv, crop);

                if (!headerRoi) {
                    crop.delete();
                    frameMat.delete();
                    console.log(`${opts.name.padEnd(31)} | ${'NO_HEADER'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const inputTensor = preprocessForPaddle(cv, headerRoi, opts);
                const feeds = { x: inputTensor };
                const ocrResults = await ocrSession.run(feeds);
                const outputKey = ocrSession.outputNames[0];
                const outputTensor = ocrResults[outputKey];
                const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab).trim();
                const matchedItem = findBestMatch(rawText, allItemNames);

                headerRoi.delete();
                crop.delete();
                frameMat.delete();

                const passed = matchedItem === expectedItem;
                console.log(`${opts.name.padEnd(31)} | ${rawText.substring(0, 19).padEnd(19)} | ${(matchedItem || 'null').padEnd(19)} | ${passed ? 'PASS' : 'FAIL'}`);
            }

            console.log('-'.repeat(95));
            expect(true).toBe(true);
        });

        it('should test all items with experimental preprocessing', async () => {
            // Testing 72px with improved homoglyphs
            const bestOption = { targetH: 72, useErosion: false };

            console.log('\n=== All Items with 72px + No Erosion ===');
            console.log('File                      | Expected            | OCR Raw             | Matched             | Status');
            console.log('-'.repeat(100));

            let passCount = 0;
            let failCount = 0;

            for (const testCase of TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    console.log(`${testCase.file.padEnd(25)} | ${testCase.expectedItem.padEnd(19)} | ${'MISSING'.padEnd(19)} | ${'N/A'.padEnd(19)} | SKIP`);
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);
                const tooltipResult = TooltipFinder.findTooltip(cv, frameMat);

                if (!tooltipResult.found) {
                    frameMat.delete();
                    console.log(`${testCase.file.padEnd(25)} | ${testCase.expectedItem.padEnd(19)} | ${'NO_TOOLTIP'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const crop = tooltipResult.crop;
                const headerRoi = extractHeaderROI(cv, crop);

                if (!headerRoi) {
                    crop.delete();
                    frameMat.delete();
                    console.log(`${testCase.file.padEnd(25)} | ${testCase.expectedItem.padEnd(19)} | ${'NO_HEADER'.padEnd(19)} | ${'N/A'.padEnd(19)} | ERROR`);
                    continue;
                }

                const inputTensor = preprocessForPaddle(cv, headerRoi, bestOption);
                const feeds = { x: inputTensor };
                const ocrResults = await ocrSession.run(feeds);
                const outputKey = ocrSession.outputNames[0];
                const outputTensor = ocrResults[outputKey];
                const rawText = decodeTensorOutput(outputTensor.data, outputTensor.dims, vocab).trim();
                const matchedItem = findBestMatch(rawText, allItemNames);

                headerRoi.delete();
                crop.delete();
                frameMat.delete();

                const passed = matchedItem === testCase.expectedItem;
                if (passed) passCount++;
                else failCount++;

                console.log(`${testCase.file.padEnd(25)} | ${testCase.expectedItem.padEnd(19)} | ${rawText.substring(0, 19).padEnd(19)} | ${(matchedItem || 'null').padEnd(19)} | ${passed ? 'PASS' : 'FAIL'}`);
            }

            console.log('-'.repeat(100));
            console.log(`Total: ${TEST_CASES.length} | Pass: ${passCount} | Fail: ${failCount}`);
            expect(true).toBe(true);
        });
    });
});
