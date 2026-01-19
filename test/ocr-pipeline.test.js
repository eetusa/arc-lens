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

// Preprocess image for PaddleOCR (from vision.worker.js)
function preprocessForPaddle(cv, srcMat) {
    const targetH = 48;
    const minW = 320;

    // 1. GRAYSCALE
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    // THINNING (EROSION)
    let eroded = new cv.Mat();
    let M = cv.Mat.ones(2, 2, cv.CV_8U);
    cv.erode(gray, eroded, M, new cv.Point(-1, -1), 1);

    M.delete();
    gray.delete();

    // 2. INVERT
    let inverted = new cv.Mat();
    cv.bitwise_not(eroded, inverted);

    // 3. STRETCH
    const stretchFactor = 1.2;
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
    eroded.delete();
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
// Format: { file: 'filename.png', expectedItem: 'Item Name' }
const TEST_CASES = [
    // Anvil variants
    { file: 'anvil_I.png', expectedItem: 'Anvil I' },
    { file: 'anvil_II.png', expectedItem: 'Anvil II' },
    { file: 'anvil_III.png', expectedItem: 'Anvil III' },
    // Stitcher variants (note typos in some filenames)
    { file: 'stitcher_I.png', expectedItem: 'Stitcher I' },
    { file: 'sticher_II.png', expectedItem: 'Stitcher II' },  // typo in filename
    { file: 'sticher_III.png', expectedItem: 'Stitcher III' }, // typo in filename
    { file: 'stitcher_IV.png', expectedItem: 'Stitcher IV' },
    // Muzzle Brake
    { file: 'muzzle_brake_II.png', expectedItem: 'Muzzle Brake II' },
    // Compensator variants
    { file: 'compensator_I.png', expectedItem: 'Compensator I' },
    { file: 'compensator_II.png', expectedItem: 'Compensator II' },
    // Grip variants
    { file: 'vertical_grip_II.png', expectedItem: 'Vertical Grip II' },
    { file: 'angled_grip_II.png', expectedItem: 'Angled Grip II' },
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
});
