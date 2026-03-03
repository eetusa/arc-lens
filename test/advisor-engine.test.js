// test/advisor-engine.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { AdvisorEngine } from '../src/logic/advisor-engine.js';
import { Action, QuestStatus } from '../src/logic/constants.js';
import fs from 'fs';
import path from 'path';

// Load self-contained fixture (decoupled from live game data)
const FIXTURE = JSON.parse(fs.readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'advisor-engine-fixtures.json'), 'utf-8'
));

/**
 * Creates a fully loaded AdvisorEngine from fixture data,
 * bypassing fetch().
 */
function createLoadedEngine() {
    const engine = new AdvisorEngine();

    // Load ItemDatabase
    Object.values(FIXTURE.items).forEach(item => engine.db._processItem(item));
    engine.db._buildGraph();
    engine.db.isLoaded = true;

    // Load QuestTracker
    engine.questTracker.questTree = FIXTURE.quests;
    engine.questTracker.isLoaded = true;

    // Load PriorityTracker
    engine.priorityTracker.devPriorities = FIXTURE.priorities.priorities || [];
    engine.priorityTracker.isLoaded = true;

    // Load ProjectTracker
    engine.projectTracker.projectData = FIXTURE.projects;
    engine.projectTracker.isLoaded = true;

    engine.ready = true;
    return engine;
}

// Helpers to disable specific demand sources
const ALL_STATIONS_MAXED = {
    "Gunsmith": 3, "Gear Bench": 3, "Refiner": 3,
    "Explosives Station": 3, "Utility Station": 3, "Medical Lab": 3
};
const ALL_PROJECTS_DONE = { "test-project": 99 };

describe('AdvisorEngine', () => {
    let engine;

    beforeEach(() => {
        engine = createLoadedEngine();
    });

    // ============================================================
    // KEEP — Quest requirements
    // ============================================================
    describe('KEEP — Quest requirements', () => {
        it('should KEEP item needed for IN_PROGRESS quest', () => {
            const result = engine.analyzeItem('antiseptic', {
                activeQuestTitles: ["Doctor's Orders"],
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            expect(result.demand.quests).toHaveLength(1);
            expect(result.demand.quests[0].title).toBe("Doctor's Orders");
            expect(result.demand.quests[0].amount).toBe(2);
            expect(result.demand.quests[0].status).toBe(QuestStatus.IN_PROGRESS);
            expect(result.demand.quests[0].priority).toBe(1);
        });

        it('should KEEP item needed for TBD quest (downstream)', () => {
            // Picking Up The Pieces active → Clearer Skies is TBD
            const result = engine.analyzeItem('arc_alloy', {
                activeQuestTitles: ["Picking Up The Pieces"],
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            const questEntry = result.demand.quests.find(q => q.title === "Clearer Skies");
            expect(questEntry).toBeDefined();
            expect(questEntry.amount).toBe(3);
            expect(questEntry.status).toBe(QuestStatus.TBD);
            expect(questEntry.priority).toBe(2);
        });

        it('should NOT include DONE quest in demand', () => {
            // Off The Radar active → Clearer Skies is DONE (ancestor)
            const result = engine.analyzeItem('arc_alloy', {
                activeQuestTitles: ["Off The Radar"],
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: ALL_PROJECTS_DONE
            });

            const questEntry = result.demand.quests.find(q => q.title === "Clearer Skies");
            expect(questEntry).toBeUndefined();
        });
    });

    // ============================================================
    // KEEP — Station (bench) requirements
    // ============================================================
    describe('KEEP — Station requirements', () => {
        it('should include station demand when not yet upgraded', () => {
            const result = engine.analyzeItem('antiseptic', {
                stationLevels: {},
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            const medLab = result.demand.stations.find(s => s.name === "Medical Lab");
            expect(medLab).toBeDefined();
            expect(medLab.tier).toBe(3);
            expect(medLab.amount).toBe(8);
        });

        it('should include station demand when partially upgraded (current < required)', () => {
            const result = engine.analyzeItem('antiseptic', {
                stationLevels: { "Medical Lab": 2 },
                projectPhases: ALL_PROJECTS_DONE
            });

            const medLab = result.demand.stations.find(s => s.name === "Medical Lab");
            expect(medLab).toBeDefined();
            expect(medLab.amount).toBe(8);
        });

        it('should exclude station demand when fully upgraded (current >= required)', () => {
            const result = engine.analyzeItem('antiseptic', {
                stationLevels: { "Medical Lab": 3 },
                projectPhases: ALL_PROJECTS_DONE
            });

            const medLab = result.demand.stations.find(s => s.name === "Medical Lab");
            expect(medLab).toBeUndefined();
        });

        it('should show all 3 station demands for ARC Alloy at level 0', () => {
            const result = engine.analyzeItem('arc_alloy', {
                stationLevels: {},
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.demand.stations).toHaveLength(3);
            const names = result.demand.stations.map(s => s.name).sort();
            expect(names).toEqual(["Explosives Station", "Medical Lab", "Utility Station"]);
        });

        it('should remove upgraded stations from demand', () => {
            const result = engine.analyzeItem('arc_alloy', {
                stationLevels: { "Medical Lab": 1 },
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.demand.stations).toHaveLength(2);
            expect(result.demand.stations.map(s => s.name)).not.toContain("Medical Lab");
        });
    });

    // ============================================================
    // KEEP — Project requirements
    // ============================================================
    describe('KEEP — Project requirements', () => {
        it('should KEEP item in active project phase', () => {
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 }
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            const entry = result.demand.projects.find(p => p.project === "Test Project");
            expect(entry).toBeDefined();
            expect(entry.amount).toBe(15);
            expect(entry.phaseId).toBe(1);
        });

        it('should include item in future phase (working on earlier phase)', () => {
            // Wires is in Phase 2, working on Phase 1 → should still appear
            const result = engine.analyzeItem('wires', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 }
            });

            const entry = result.demand.projects.find(
                p => p.project === "Test Project" && p.phaseId === 2
            );
            expect(entry).toBeDefined();
            expect(entry.amount).toBe(3);
        });

        it('should exclude item when phase already passed', () => {
            // Metal Parts only in Phase 1, working on Phase 2
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 2 }
            });

            const entry = result.demand.projects.find(p => p.project === "Test Project");
            expect(entry).toBeUndefined();
        });

        it('should exclude item when sub-phase marked completed', () => {
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 },
                projectProgress: {
                    "test-project": { completed: { "1:Metal Parts": true } }
                }
            });

            const entry = result.demand.projects.find(
                p => p.project === "Test Project" && p.phaseId === 1
            );
            expect(entry).toBeUndefined();
        });
    });

    // ============================================================
    // KEEP — Combined requirements
    // ============================================================
    describe('KEEP — Combined requirements', () => {
        it('should combine quest and station demand', () => {
            const result = engine.analyzeItem('antiseptic', {
                activeQuestTitles: ["Doctor's Orders"],
                stationLevels: {},
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            expect(result.demand.quests).toHaveLength(1);
            expect(result.demand.stations).toHaveLength(1);
            expect(result.demand.totalRequired).toBe(2 + 8);
            expect(result.verdict.reason).toContain("Quest");
            expect(result.verdict.reason).toContain("Upgrade");
        });

        it('should combine quest, station, and project demand', () => {
            // ARC Alloy: Clearer Skies x3 (TBD) + 3 stations x6 + project Phase 1 x5
            const result = engine.analyzeItem('arc_alloy', {
                activeQuestTitles: ["Picking Up The Pieces"],
                stationLevels: {},
                projectPhases: { "test-project": 1 }
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            expect(result.demand.quests).toHaveLength(1);
            expect(result.demand.stations).toHaveLength(3);
            expect(result.demand.projects).toHaveLength(1);
            expect(result.demand.totalRequired).toBe(3 + 18 + 5);
            expect(result.verdict.reason).toContain("Quest");
            expect(result.verdict.reason).toContain("Upgrade");
            expect(result.verdict.reason).toContain("Project Phase");
        });

        it('should have quantityToKeep equal totalRequired', () => {
            const result = engine.analyzeItem('antiseptic', {
                activeQuestTitles: ["Doctor's Orders"],
                stationLevels: {},
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.quantityToKeep).toBe(result.demand.totalRequired);
        });
    });

    // ============================================================
    // KEEP — Reason formatting
    // ============================================================
    describe('KEEP — Reason formatting', () => {
        it('should format plural counts correctly', () => {
            // ARC Alloy: 1 quest + 3 stations → "1 Quest & 3 Upgrades"
            const result = engine.analyzeItem('arc_alloy', {
                activeQuestTitles: ["Picking Up The Pieces"],
                stationLevels: {},
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.reason).toBe("1 Quest & 3 Upgrades");
        });

        it('should use singular form for single entry', () => {
            // Metal Parts: Gunsmith T1 + Refiner T1; satisfy Gunsmith → 1 station left
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: { "Gunsmith": 1 },
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.reason).toBe("1 Upgrade");
        });

        it('should include project phase in reason string', () => {
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 }
            });

            expect(result.verdict.reason).toContain("Project Phase");
        });
    });

    // ============================================================
    // Non-KEEP verdicts (light coverage)
    // ============================================================
    describe('Non-KEEP verdicts', () => {
        it('should not KEEP basic material with no requirements', () => {
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).not.toBe(Action.KEEP);
        });

        it('should always KEEP key items regardless of progress', () => {
            const result = engine.analyzeItem('cellar_key', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.verdict.action).toBe(Action.KEEP);
            expect(result.verdict.reason).toContain("Key");
        });

        it('should return UNKNOWN for nonexistent item', () => {
            const result = engine.analyzeItem('Nonexistent Item');

            expect(result.verdict.action).toBe(Action.UNKNOWN);
            expect(result.verdict.reason).toContain("not found");
        });

        it('should return error when engine not ready', () => {
            const unready = new AdvisorEngine();
            const result = unready.analyzeItem('antiseptic');

            expect(result.verdict.action).toBe(Action.UNKNOWN);
            expect(result.verdict.reason).toContain("loading");
        });
    });

    // ============================================================
    // Station level integration
    // ============================================================
    describe('Station level integration', () => {
        it('should remove all station demand when all upgraded to required tier', () => {
            // Off The Radar active → Clearer Skies is DONE, so no quest demand
            const result = engine.analyzeItem('arc_alloy', {
                activeQuestTitles: ["Off The Radar"],
                stationLevels: {
                    "Explosives Station": 1,
                    "Medical Lab": 1,
                    "Utility Station": 1
                },
                projectPhases: ALL_PROJECTS_DONE
            });

            expect(result.demand.stations).toHaveLength(0);
            expect(result.demand.quests).toHaveLength(0);
            expect(result.verdict.action).not.toBe(Action.KEEP);
        });
    });

    // ============================================================
    // Project progression integration
    // ============================================================
    describe('Project progression integration', () => {
        it('should drop project demand when phase is past', () => {
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 2 }
            });

            expect(result.demand.projects).toHaveLength(0);
            expect(result.verdict.action).not.toBe(Action.KEEP);
        });

        it('should exclude completed sub-phase item but keep others in same phase', () => {
            // Mark only Plastic Parts completed → Metal Parts still needed
            const result = engine.analyzeItem('metal_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 },
                projectProgress: {
                    "test-project": { completed: { "1:Plastic Parts": true } }
                }
            });

            const entry = result.demand.projects.find(
                p => p.project === "Test Project" && p.phaseId === 1
            );
            expect(entry).toBeDefined();
            expect(entry.amount).toBe(15);
        });

        it('should exclude item from demand when its sub-phase is completed', () => {
            const result = engine.analyzeItem('plastic_parts', {
                stationLevels: ALL_STATIONS_MAXED,
                projectPhases: { "test-project": 1 },
                projectProgress: {
                    "test-project": { completed: { "1:Plastic Parts": true } }
                }
            });

            const entry = result.demand.projects.find(
                p => p.project === "Test Project" && p.phaseId === 1
            );
            expect(entry).toBeUndefined();
        });
    });
});
