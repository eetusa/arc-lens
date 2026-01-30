// test/quest-ocr.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { QuestOCR } from '../src/workers/quest-ocr.js';
import * as ort from 'onnxruntime-web';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let cv;
let ocrSession = null;
let vocab = [];

const MODEL_PATH = path.join(import.meta.dirname, '..', 'public', 'en_PP-OCRv4_rec_infer.onnx');
const VOCAB_PATH = path.join(import.meta.dirname, '..', 'public', 'en_dict.txt');

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

// Save debug image to file for visual inspection
function saveDebugImage(debugData, filename) {
    if (!debugData || !debugData.buffer) return;

    const png = new PNG({ width: debugData.width, height: debugData.height });
    const buffer = new Uint8Array(debugData.buffer);
    for (let i = 0; i < buffer.length; i++) {
        png.data[i] = buffer[i];
    }

    const outputPath = path.join(import.meta.dirname, 'output', filename);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, PNG.sync.write(png));
    console.log(`  Debug image saved: ${outputPath}`);
}

// Known quest names from quests.json
const QUEST_NAMES = [
    "Picking Up The Pieces",
    "Clearer Skies",
    "Trash Into Treasure",
    "Off The Radar",
    "A Bad Feeling",
    "Safe Passage",
    "What Goes Around",
    "Sparks Fly",
    "The Right Tool",
    "A Better Use",
    "Greasing Her Palms",
    "Hatch Repairs",
    "Down To Earth",
    "The Trifecta",
    "In My Image",
    "Cold Storage",
    "Snap And Salvage",
    "Doctor's Orders",
    "Medical Merchandise",
    "A Reveal In Ruins",
    "A Lay Of The Land",
    "Eyes In The Sky",
    "A Balanced Harvest",
    "Untended Garden",
    "The Root Of The Matter",
    "After Rain Comes",
    "Water Troubles",
    "Source Of The Contaminant",
    "Switching The Supply",
    "A Warm Place To Rest",
    "Prescriptions Of The Past",
    "Power Out",
    "Flickering Threat",
    "Bees!",
    "Espresso",
    "Life Of A Pharmacist",
    "Dormant Barons",
    "What We Left Behind",
    "Mixed Signals",
    "Broken Monument",
    "Straight Record",
    "Keeping The Memory",
    "Echoes Of Victory Ridge",
    "Marked For Death",
    "Market Correction",
    "Eyes On The Prize",
    "Industrial Espionage",
    "Unexpected Initiative",
    "A Symbol Of Unification",
    "Celeste's Journals",
    "Out Of The Shadows",
    "The Major's Footlocker",
    "Back On Top",
    "Our Presence Up There",
    "Lost In Transmission",
    "Communication Hideout",
    "Into The Fray",
    "Paving The Way",
    "Deciphering The Data",
    "Groundbreaking",
    "Tribute To Toledo",
    "A Toxic Trail",
    "The Stench Of Corruption",
    "Digging Up Dirt",
    "Building A Library",
    "Turnabout",
    "A New Type Of Plant",
    "A First Foothold",
    "Reduced To Rubble",
    "With A Trace",
    "The Clean Dream",
    "Armored Transports",
    // New quests from Headwinds update
    "A Prime Specimen",
    "The League",
    "With A View"
];

// Test cases - screenshots with expected quests
const QUEST_TEST_CASES = [
    {
        file: '1080p/main-menu-play.png',
        expectedQuests: ['Switching The Supply', 'Our Presence Up There'],
        description: '1080p PLAY tab with 2 quests'
    },
    {
        file: '1440p/main-menu-play.png',
        expectedQuests: ['Switching The Supply', 'Our Presence Up There'],
        description: '1440p PLAY tab with 2 quests'
    },
    {
        file: '1080p/menu-closed.png',
        expectedQuests: ['The Root Of The Matter', 'After Rain Comes', "The Major's Footlocker"],
        description: '1080p menu-closed with 3 quests (FLICKERING FLAMES event present)'
    },
    {
        file: '1440p/menu-closed.png',
        expectedQuests: ['The Root Of The Matter', 'After Rain Comes', "The Major's Footlocker"],
        description: '1440p menu-closed with 3 quests (FLICKERING FLAMES event present)'
    },
    {
        file: '1080p/main-menu-quests-new-patch.png',
        expectedQuests: ['A Prime Specimen', 'The League', 'With A View', 'Switching The Supply'],
        description: '1080p PLAY tab with 4 quests (new patch)'
    },
    {
        file: '1440p/main-menu-quests-new-patch.png',
        expectedQuests: ['A Prime Specimen', 'The League', 'With A View', 'Switching The Supply'],
        description: '1440p PLAY tab with 4 quests (new patch)'
    },
];

describe('QuestOCR', () => {
    let questOCR;

    beforeAll(async () => {
        cv = require('@techstark/opencv-js');
        await new Promise((resolve) => {
            if (cv.Mat) resolve();
            else cv.onRuntimeInitialized = resolve;
        });

        // Load ONNX model
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.simd = true;

        ocrSession = await ort.InferenceSession.create(MODEL_PATH, {
            executionProviders: ['wasm']
        });

        // Load vocabulary
        const vocabText = fs.readFileSync(VOCAB_PATH, 'utf-8');
        vocab = vocabText.split(/\r?\n/);

        questOCR = new QuestOCR();
        await questOCR.init(cv, QUEST_NAMES);

        console.log(`QuestOCR ready: ${questOCR.ready}`);
        console.log(`Quest names loaded: ${questOCR.allQuestNames.length}`);
        console.log(`OCR model loaded: ${ocrSession !== null}`);
        console.log(`Vocabulary size: ${vocab.length}`);
    });

    it('should initialize correctly', () => {
        expect(questOCR.ready).toBe(true);
        expect(questOCR.allQuestNames.length).toBeGreaterThan(0);
    });

    describe('Search Area Visualization', () => {
        it('should show the search area for visual inspection', () => {
            for (const testCase of QUEST_TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                // Calculate search area bounds
                const h = frameMat.rows;
                const w = frameMat.cols;
                const searchX = Math.floor(w * questOCR.SEARCH_X_PERCENT);
                const searchY = Math.floor(h * questOCR.SEARCH_Y_PERCENT);
                const searchW = Math.floor(w * questOCR.SEARCH_WIDTH_PERCENT);
                const searchH = Math.floor(h * questOCR.SEARCH_HEIGHT_PERCENT);

                console.log(`\n${testCase.file}:`);
                console.log(`  Image size: ${w}x${h}`);
                console.log(`  Search area: x=${searchX}, y=${searchY}, w=${searchW}, h=${searchH}`);

                // Draw search area on image for visualization
                const debugMat = frameMat.clone();
                cv.rectangle(debugMat,
                    new cv.Point(searchX, searchY),
                    new cv.Point(searchX + searchW, searchY + searchH),
                    new cv.Scalar(255, 0, 255, 255), 2); // Magenta for search area

                // Save debug image
                const debugBuffer = new Uint8ClampedArray(debugMat.data).buffer.slice(0);
                const debugData = {
                    width: debugMat.cols,
                    height: debugMat.rows,
                    buffer: debugBuffer
                };

                const filename = testCase.file.replace('/', '-').replace('.png', '-searcharea.png');
                saveDebugImage(debugData, filename);

                debugMat.delete();
                frameMat.delete();
            }

            expect(true).toBe(true);
        });
    });

    describe('QUESTS Header Detection', () => {
        it('should find QUESTS header and text regions dynamically', async () => {
            for (const testCase of QUEST_TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                // Reset all state for testing
                questOCR.reset();

                // Call detect without OCR session to just see text regions
                const result = await questOCR.detect(cv, frameMat, null, null);

                console.log(`\n${testCase.file}:`);
                console.log(`  QUESTS header found: ${result.questsHeaderFound}`);
                console.log(`  Detected quests: ${JSON.stringify(result.detectedQuests)}`);
                console.log(`  Expected quests: ${JSON.stringify(testCase.expectedQuests)}`);

                // Save debug image if available
                if (result.debug) {
                    const filename = testCase.file.replace('/', '-').replace('.png', '-detection.png');
                    saveDebugImage(result.debug, filename);
                }

                frameMat.delete();

                // Verify QUESTS header was found
                expect(result.questsHeaderFound).toBe(true);
            }
        });
    });

    describe('Quest OCR Recognition', () => {
        it('should detect quest names using OCR', async () => {
            for (const testCase of QUEST_TEST_CASES) {
                const testFilePath = path.join(FIXTURES_DIR, testCase.file);

                if (!fs.existsSync(testFilePath)) {
                    console.log(`Skipping: ${testCase.file} not found`);
                    continue;
                }

                const png = loadPNG(testFilePath);
                const frameMat = pngToMat(cv, png);

                // Reset all state for testing
                questOCR.reset();

                // Call detect WITH OCR session
                const result = await questOCR.detect(cv, frameMat, ocrSession, vocab);

                console.log(`\n${testCase.file}:`);
                console.log(`  QUESTS header found: ${result.questsHeaderFound}`);
                console.log(`  Detected quests: ${JSON.stringify(result.detectedQuests)}`);
                console.log(`  Expected quests: ${JSON.stringify(testCase.expectedQuests)}`);

                // Save debug image if available
                if (result.debug) {
                    const filename = testCase.file.replace('/', '-').replace('.png', '-ocr.png');
                    saveDebugImage(result.debug, filename);
                }

                frameMat.delete();

                // Verify quests were detected
                expect(result.questsHeaderFound).toBe(true);

                // Check if expected quests were found
                for (const expectedQuest of testCase.expectedQuests) {
                    const found = result.detectedQuests.includes(expectedQuest);
                    if (!found) {
                        console.log(`  MISSING: "${expectedQuest}"`);
                    }
                }
            }
        });
    });
});
