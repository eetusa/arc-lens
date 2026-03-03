// test/project-tracker.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectTracker } from '../src/logic/project-tracker.js';
import fs from 'fs';
import path from 'path';

// Load the actual project data for testing
const projectsPath = path.join(import.meta.dirname, '..', 'public', 'projects.json');
const PROJECT_DATA = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));

// Helper to create a loaded ProjectTracker
function createLoadedTracker() {
    const tracker = new ProjectTracker();
    tracker.projectData = PROJECT_DATA;
    tracker.isLoaded = true;
    return tracker;
}

// Test project data with known structure for deterministic tests
const TEST_PROJECT_DATA = {
    projects: [
        {
            id: "test-project",
            name: "Test Project",
            active: true,
            phases: [
                {
                    id: 1,
                    name: "Phase 1",
                    requirements: [
                        { item: "Rusted Bolts", amount: 3 },
                        { item: "Metal Parts", amount: 10 }
                    ]
                },
                {
                    id: 2,
                    name: "Phase 2",
                    requirements: [
                        { item: "Rusted Bolts", amount: 5 },
                        { item: "Wires", amount: 8 }
                    ]
                },
                {
                    id: 3,
                    name: "Phase 3",
                    requirements: [
                        { item: "ARC Alloy", amount: 20 }
                    ]
                }
            ]
        }
    ]
};

function createTestTracker() {
    const tracker = new ProjectTracker();
    tracker.projectData = TEST_PROJECT_DATA;
    tracker.isLoaded = true;
    return tracker;
}

describe('ProjectTracker', () => {
    // ============================================================
    // BASIC FUNCTIONALITY (no projectProgress)
    // ============================================================
    describe('Backward compatibility (no projectProgress)', () => {
        let tracker;

        beforeEach(() => {
            tracker = createTestTracker();
        });

        it('should find items needed in current phase', () => {
            const result = tracker.isItemNeeded("Rusted Bolts", { "test-project": 1 });
            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(2); // Phase 1 and Phase 2
        });

        it('should skip phases before the current one', () => {
            const result = tracker.isItemNeeded("Rusted Bolts", { "test-project": 2 });
            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(1); // Only Phase 2
            expect(result.matches[0].phaseId).toBe(2);
        });

        it('should return not needed for items not in any phase', () => {
            const result = tracker.isItemNeeded("Nonexistent Item", { "test-project": 1 });
            expect(result.needed).toBe(false);
            expect(result.matches.length).toBe(0);
        });

        it('should default to phase 1 if project not in projectPhases', () => {
            const result = tracker.isItemNeeded("Rusted Bolts", {});
            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(2);
        });

        it('getAllNeededItems should return all items from current phase onward', () => {
            const items = tracker.getAllNeededItems({ "test-project": 2 });
            expect(items.length).toBe(3); // Phase 2: Rusted Bolts + Wires, Phase 3: ARC Alloy
            expect(items.some(i => i.itemName === "Metal Parts")).toBe(false); // Phase 1 only
        });

        it('getTotalAmountNeeded should sum across phases', () => {
            const total = tracker.getTotalAmountNeeded("Rusted Bolts", { "test-project": 1 });
            expect(total).toBe(8); // 3 from Phase 1 + 5 from Phase 2
        });
    });

    // ============================================================
    // SUB-PHASE COMPLETION TESTS
    // ============================================================
    describe('Sub-phase completion (projectProgress)', () => {
        let tracker;

        beforeEach(() => {
            tracker = createTestTracker();
        });

        it('should exclude completed items from isItemNeeded', () => {
            const projectProgress = {
                "test-project": {
                    completed: { "1:Rusted Bolts": true }
                }
            };

            const result = tracker.isItemNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(1); // Only Phase 2 match remains
            expect(result.matches[0].phaseId).toBe(2);
        });

        it('should still return non-completed items in the same phase', () => {
            const projectProgress = {
                "test-project": {
                    completed: { "1:Rusted Bolts": true }
                }
            };

            const result = tracker.isItemNeeded(
                "Metal Parts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(1);
            expect(result.matches[0].phaseId).toBe(1);
        });

        it('should not affect items in future phases', () => {
            const projectProgress = {
                "test-project": {
                    completed: { "1:Rusted Bolts": true }
                }
            };

            const result = tracker.isItemNeeded(
                "ARC Alloy",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(1);
            expect(result.matches[0].phaseId).toBe(3);
        });

        it('should return not needed when all matches are completed', () => {
            const projectProgress = {
                "test-project": {
                    completed: {
                        "1:Rusted Bolts": true,
                        "2:Rusted Bolts": true
                    }
                }
            };

            const result = tracker.isItemNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(false);
            expect(result.matches.length).toBe(0);
        });

        it('should exclude completed items from getAllNeededItems', () => {
            const projectProgress = {
                "test-project": {
                    completed: { "1:Metal Parts": true, "2:Wires": true }
                }
            };

            const items = tracker.getAllNeededItems(
                { "test-project": 1 },
                projectProgress
            );

            // Phase 1: Rusted Bolts (Metal Parts completed)
            // Phase 2: Rusted Bolts (Wires completed)
            // Phase 3: ARC Alloy
            expect(items.length).toBe(3);
            expect(items.some(i => i.itemName === "Metal Parts")).toBe(false);
            expect(items.some(i => i.itemName === "Wires")).toBe(false);
        });

        it('should exclude completed items from getTotalAmountNeeded', () => {
            const projectProgress = {
                "test-project": {
                    completed: { "1:Rusted Bolts": true }
                }
            };

            const total = tracker.getTotalAmountNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(total).toBe(5); // Only Phase 2's amount (Phase 1 completed)
        });

        it('should handle empty completed object gracefully', () => {
            const projectProgress = {
                "test-project": { completed: {} }
            };

            const result = tracker.isItemNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(2);
        });

        it('should handle missing project in projectProgress', () => {
            const projectProgress = {
                "other-project": { completed: { "1:Rusted Bolts": true } }
            };

            const result = tracker.isItemNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(2);
        });

        it('should handle projectProgress without completed key', () => {
            const projectProgress = {
                "test-project": { viewing: 1 }
            };

            const result = tracker.isItemNeeded(
                "Rusted Bolts",
                { "test-project": 1 },
                projectProgress
            );

            expect(result.needed).toBe(true);
            expect(result.matches.length).toBe(2);
        });
    });

    // ============================================================
    // REAL DATA TESTS
    // ============================================================
    describe('With real project data', () => {
        let tracker;

        beforeEach(() => {
            tracker = createLoadedTracker();
        });

        it('should load real project data', () => {
            expect(tracker.isLoaded).toBe(true);
            expect(tracker.getProjects().length).toBeGreaterThanOrEqual(0);
        });

        it('should handle isItemNeeded with no projectProgress', () => {
            // Should work the same as before when no projectProgress is passed
            const result = tracker.isItemNeeded("Metal Parts", {});
            // Just verify it doesn't throw and returns valid structure
            expect(result).toHaveProperty('needed');
            expect(result).toHaveProperty('matches');
            expect(Array.isArray(result.matches)).toBe(true);
        });
    });

    // ============================================================
    // EDGE CASES
    // ============================================================
    describe('Edge cases', () => {
        it('should return empty results when not loaded', () => {
            const tracker = new ProjectTracker();
            const result = tracker.isItemNeeded("Rusted Bolts", {}, {});
            expect(result.needed).toBe(false);
            expect(result.matches.length).toBe(0);
        });

        it('getAllNeededItems should return empty when not loaded', () => {
            const tracker = new ProjectTracker();
            const items = tracker.getAllNeededItems({}, {});
            expect(items.length).toBe(0);
        });

        it('getTotalAmountNeeded should return 0 when not loaded', () => {
            const tracker = new ProjectTracker();
            const total = tracker.getTotalAmountNeeded("Rusted Bolts", {}, {});
            expect(total).toBe(0);
        });

        it('should be case-insensitive for item names', () => {
            const tracker = createTestTracker();
            const result = tracker.isItemNeeded("rusted bolts", { "test-project": 1 });
            expect(result.needed).toBe(true);
        });
    });
});
