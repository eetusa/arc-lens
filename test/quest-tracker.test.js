// test/quest-tracker.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { QuestTracker } from '../src/logic/quest-tracker.js';
import { QuestStatus } from '../src/logic/constants.js';
import fs from 'fs';
import path from 'path';

// Load the actual quest tree for testing
const questTreePath = path.join(import.meta.dirname, '..', 'public', 'quests.json');
const QUEST_TREE = JSON.parse(fs.readFileSync(questTreePath, 'utf-8'));

// Helper to create a loaded QuestTracker with the real quest tree
function createLoadedTracker() {
    const tracker = new QuestTracker();
    tracker.questTree = QUEST_TREE;
    tracker.isLoaded = true;
    return tracker;
}

describe('QuestTracker', () => {
    let tracker;

    beforeEach(() => {
        tracker = createLoadedTracker();
    });

    // ============================================================
    // INITIALIZATION TESTS
    // ============================================================
    describe('Initialization', () => {
        it('should start unloaded', () => {
            const freshTracker = new QuestTracker();
            expect(freshTracker.isLoaded).toBe(false);
            expect(freshTracker.questTree).toEqual({});
        });

        it('should return UNKNOWN when not loaded', () => {
            const freshTracker = new QuestTracker();
            const result = freshTracker.getStatus(['A Bad Feeling'], 'Off The Radar');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });

        it('should be loaded after initialization', () => {
            expect(tracker.isLoaded).toBe(true);
            expect(Object.keys(tracker.questTree).length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // IN_PROGRESS STATUS TESTS
    // ============================================================
    describe('IN_PROGRESS Status', () => {
        it('should return IN_PROGRESS when target quest is active', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'A Bad Feeling');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for first quest in active list', () => {
            const result = tracker.getStatus(['Picking Up The Pieces', 'A First Foothold'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for last quest in active list', () => {
            const result = tracker.getStatus(['Picking Up The Pieces', 'A First Foothold'], 'A First Foothold');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for middle quest in active list', () => {
            const result = tracker.getStatus(['Clearer Skies', 'A Bad Feeling', 'Doctor\'s Orders'], 'A Bad Feeling');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for root quest when active', () => {
            const result = tracker.getStatus(['Picking Up The Pieces'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for Blue Gate root quest when active', () => {
            const result = tracker.getStatus(['A First Foothold'], 'A First Foothold');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should return IN_PROGRESS for end-game quest when active', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Groundbreaking');
            expect(result).toBe(QuestStatus.IN_PROGRESS);
        });
    });

    // ============================================================
    // DONE STATUS - LINEAR CHAINS
    // ============================================================
    describe('DONE Status - Linear Chains', () => {
        it('should mark immediate parent as DONE', () => {
            const result = tracker.getStatus(['Clearer Skies'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark grandparent as DONE', () => {
            const result = tracker.getStatus(['Off The Radar'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark ancestor 3 levels up as DONE', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark ancestor 4 levels up as DONE', () => {
            const result = tracker.getStatus(['Doctor\'s Orders'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        // Safe Passage chain
        it('should mark Safe Passage as DONE when on What Goes Around', () => {
            const result = tracker.getStatus(['What Goes Around'], 'Safe Passage');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Safe Passage as DONE when on Sparks Fly', () => {
            const result = tracker.getStatus(['Sparks Fly'], 'Safe Passage');
            expect(result).toBe(QuestStatus.DONE);
        });

        // The Right Tool chain
        it('should mark The Right Tool as DONE when on A Better Use', () => {
            const result = tracker.getStatus(['A Better Use'], 'The Right Tool');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark The Right Tool as DONE when on Greasing Her Palms', () => {
            const result = tracker.getStatus(['Greasing Her Palms'], 'The Right Tool');
            expect(result).toBe(QuestStatus.DONE);
        });

        // Hatch Repairs chain
        it('should mark Hatch Repairs as DONE when on Down To Earth', () => {
            const result = tracker.getStatus(['Down To Earth'], 'Hatch Repairs');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Hatch Repairs as DONE when on The Trifecta', () => {
            const result = tracker.getStatus(['The Trifecta'], 'Hatch Repairs');
            expect(result).toBe(QuestStatus.DONE);
        });

        // In My Image chain
        it('should mark In My Image as DONE when on Cold Storage', () => {
            const result = tracker.getStatus(['Cold Storage'], 'In My Image');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark In My Image as DONE when on Snap And Salvage', () => {
            const result = tracker.getStatus(['Snap And Salvage'], 'In My Image');
            expect(result).toBe(QuestStatus.DONE);
        });

        // Blue Gate chain
        it('should mark A First Foothold as DONE when on Reduced To Rubble', () => {
            const result = tracker.getStatus(['Reduced To Rubble'], 'A First Foothold');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A First Foothold as DONE when on With A Trace', () => {
            const result = tracker.getStatus(['With A Trace'], 'A First Foothold');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A First Foothold as DONE when on The Clean Dream', () => {
            const result = tracker.getStatus(['The Clean Dream'], 'A First Foothold');
            expect(result).toBe(QuestStatus.DONE);
        });
    });

    // ============================================================
    // DONE STATUS - DEEP ANCESTRY CHAINS
    // ============================================================
    describe('DONE Status - Deep Ancestry', () => {
        // Doctor's Orders long chain: A Bad Feeling → Doctor's Orders → Medical Merchandise →
        // A Reveal In Ruins → A Lay Of The Land → Eyes In The Sky → After Rain Comes →
        // Water Troubles → Source Of The Contaminant → Switching The Supply →
        // A Warm Place To Rest → Prescriptions Of The Past → Power Out →
        // Flickering Threat → Bees! → Espresso → Life Of A Pharmacist

        it('should mark Picking Up The Pieces as DONE when on Life Of A Pharmacist (16 levels)', () => {
            const result = tracker.getStatus(['Life Of A Pharmacist'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A Bad Feeling as DONE when on Life Of A Pharmacist', () => {
            const result = tracker.getStatus(['Life Of A Pharmacist'], 'A Bad Feeling');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Doctor\'s Orders as DONE when on Life Of A Pharmacist', () => {
            const result = tracker.getStatus(['Life Of A Pharmacist'], 'Doctor\'s Orders');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Eyes In The Sky as DONE when on Life Of A Pharmacist', () => {
            const result = tracker.getStatus(['Life Of A Pharmacist'], 'Eyes In The Sky');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Bees! as DONE when on Life Of A Pharmacist', () => {
            const result = tracker.getStatus(['Life Of A Pharmacist'], 'Bees!');
            expect(result).toBe(QuestStatus.DONE);
        });

        // Groundbreaking chain (even longer): ... → Back On Top → Our Presence Up There →
        // Lost In Transmission → Communication Hideout → Into The Fray → Paving The Way →
        // Deciphering The Data → Groundbreaking

        it('should mark Picking Up The Pieces as DONE when on Groundbreaking (very deep)', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A Bad Feeling as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'A Bad Feeling');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark The Trifecta as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'The Trifecta');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Unexpected Initiative as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Unexpected Initiative');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Back On Top as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Back On Top');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Into The Fray as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Into The Fray');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Paving The Way as DONE when on Groundbreaking', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'Paving The Way');
            expect(result).toBe(QuestStatus.DONE);
        });
    });

    // ============================================================
    // DONE STATUS - CONVERGENT PATHS (Multiple Prerequisites)
    // ============================================================
    describe('DONE Status - Convergent Paths', () => {
        // Off The Radar requires BOTH Clearer Skies AND Trash Into Treasure

        it('should mark Clearer Skies as DONE when on Off The Radar', () => {
            const result = tracker.getStatus(['Off The Radar'], 'Clearer Skies');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Trash Into Treasure as DONE when on Off The Radar', () => {
            const result = tracker.getStatus(['Off The Radar'], 'Trash Into Treasure');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark both prerequisites as DONE when on A Bad Feeling', () => {
            expect(tracker.getStatus(['A Bad Feeling'], 'Clearer Skies')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['A Bad Feeling'], 'Trash Into Treasure')).toBe(QuestStatus.DONE);
        });

        // Unexpected Initiative requires BOTH Echoes Of Victory Ridge AND Industrial Espionage

        it('should mark Echoes Of Victory Ridge as DONE when on Unexpected Initiative', () => {
            const result = tracker.getStatus(['Unexpected Initiative'], 'Echoes Of Victory Ridge');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Industrial Espionage as DONE when on Unexpected Initiative', () => {
            const result = tracker.getStatus(['Unexpected Initiative'], 'Industrial Espionage');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark both convergent branches as DONE when on A Symbol Of Unification', () => {
            expect(tracker.getStatus(['A Symbol Of Unification'], 'Echoes Of Victory Ridge')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['A Symbol Of Unification'], 'Industrial Espionage')).toBe(QuestStatus.DONE);
        });

        it('should mark entire Straight Record branch as DONE when on Unexpected Initiative', () => {
            expect(tracker.getStatus(['Unexpected Initiative'], 'Straight Record')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['Unexpected Initiative'], 'Keeping The Memory')).toBe(QuestStatus.DONE);
        });

        it('should mark entire Marked For Death branch as DONE when on Unexpected Initiative', () => {
            expect(tracker.getStatus(['Unexpected Initiative'], 'Marked For Death')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['Unexpected Initiative'], 'Market Correction')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['Unexpected Initiative'], 'Eyes On The Prize')).toBe(QuestStatus.DONE);
        });

        // Armored Transports requires BOTH With A Trace AND A New Type Of Plant

        it('should mark With A Trace as DONE when on Armored Transports', () => {
            const result = tracker.getStatus(['Armored Transports'], 'With A Trace');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A New Type Of Plant as DONE when on Armored Transports', () => {
            const result = tracker.getStatus(['Armored Transports'], 'A New Type Of Plant');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A First Foothold as DONE when on Armored Transports', () => {
            const result = tracker.getStatus(['Armored Transports'], 'A First Foothold');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Building A Library as DONE when on Armored Transports', () => {
            const result = tracker.getStatus(['Armored Transports'], 'Building A Library');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Life Of A Pharmacist as DONE when on Armored Transports', () => {
            const result = tracker.getStatus(['Armored Transports'], 'Life Of A Pharmacist');
            expect(result).toBe(QuestStatus.DONE);
        });
    });

    // ============================================================
    // DONE STATUS - BRANCHING PATHS (Same Parent, Different Children)
    // ============================================================
    describe('DONE Status - Branching Paths', () => {
        // From A Bad Feeling: Safe Passage, The Right Tool, Hatch Repairs, In My Image, Doctor's Orders

        it('should mark A Bad Feeling as DONE when on any of its children', () => {
            expect(tracker.getStatus(['Safe Passage'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['The Right Tool'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['Hatch Repairs'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['In My Image'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['Doctor\'s Orders'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
        });

        // From Eyes In The Sky: A Balanced Harvest, After Rain Comes

        it('should mark Eyes In The Sky as DONE when on A Balanced Harvest', () => {
            const result = tracker.getStatus(['A Balanced Harvest'], 'Eyes In The Sky');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Eyes In The Sky as DONE when on After Rain Comes', () => {
            const result = tracker.getStatus(['After Rain Comes'], 'Eyes In The Sky');
            expect(result).toBe(QuestStatus.DONE);
        });

        // From Life Of A Pharmacist: Tribute To Toledo, A Toxic Trail, Digging Up Dirt

        it('should mark Life Of A Pharmacist as DONE when on Tribute To Toledo', () => {
            const result = tracker.getStatus(['Tribute To Toledo'], 'Life Of A Pharmacist');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Life Of A Pharmacist as DONE when on A Toxic Trail', () => {
            const result = tracker.getStatus(['A Toxic Trail'], 'Life Of A Pharmacist');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Life Of A Pharmacist as DONE when on Digging Up Dirt', () => {
            const result = tracker.getStatus(['Digging Up Dirt'], 'Life Of A Pharmacist');
            expect(result).toBe(QuestStatus.DONE);
        });

        // From Building A Library: Turnabout, A New Type Of Plant

        it('should mark Building A Library as DONE when on Turnabout', () => {
            const result = tracker.getStatus(['Turnabout'], 'Building A Library');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Building A Library as DONE when on A New Type Of Plant', () => {
            const result = tracker.getStatus(['A New Type Of Plant'], 'Building A Library');
            expect(result).toBe(QuestStatus.DONE);
        });

        // From Dormant Barons: What We Left Behind, Broken Monument

        it('should mark Dormant Barons as DONE when on What We Left Behind', () => {
            const result = tracker.getStatus(['What We Left Behind'], 'Dormant Barons');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Dormant Barons as DONE when on Broken Monument', () => {
            const result = tracker.getStatus(['Broken Monument'], 'Dormant Barons');
            expect(result).toBe(QuestStatus.DONE);
        });

        // From Broken Monument: Straight Record, Marked For Death

        it('should mark Broken Monument as DONE when on Straight Record', () => {
            const result = tracker.getStatus(['Straight Record'], 'Broken Monument');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark Broken Monument as DONE when on Marked For Death', () => {
            const result = tracker.getStatus(['Marked For Death'], 'Broken Monument');
            expect(result).toBe(QuestStatus.DONE);
        });

        // From A Symbol Of Unification: Celeste's Journals, Out Of The Shadows

        it('should mark A Symbol Of Unification as DONE when on Celeste\'s Journals', () => {
            const result = tracker.getStatus(['Celeste\'s Journals'], 'A Symbol Of Unification');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark A Symbol Of Unification as DONE when on Out Of The Shadows', () => {
            const result = tracker.getStatus(['Out Of The Shadows'], 'A Symbol Of Unification');
            expect(result).toBe(QuestStatus.DONE);
        });
    });

    // ============================================================
    // TBD STATUS - NOT YET REACHED
    // ============================================================
    describe('TBD Status - Not Yet Reached', () => {
        it('should return TBD for quest not yet reached (child of active)', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'Safe Passage');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for quest several steps ahead', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'Sparks Fly');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for distant future quest', () => {
            const result = tracker.getStatus(['Picking Up The Pieces'], 'Groundbreaking');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for end-game quest when at beginning', () => {
            const result = tracker.getStatus(['Picking Up The Pieces'], 'Life Of A Pharmacist');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for Blue Gate quests when on Dam Battlegrounds path', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'A First Foothold');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for quest immediately after root', () => {
            const result = tracker.getStatus(['Picking Up The Pieces'], 'Clearer Skies');
            expect(result).toBe(QuestStatus.TBD);
        });
    });

    // ============================================================
    // TBD STATUS - PARALLEL BRANCHES
    // ============================================================
    describe('TBD Status - Parallel Branches', () => {
        // On Safe Passage branch, other A Bad Feeling branches should be TBD

        it('should return TBD for The Right Tool when on Safe Passage branch', () => {
            const result = tracker.getStatus(['Sparks Fly'], 'The Right Tool');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for Hatch Repairs when on Safe Passage branch', () => {
            const result = tracker.getStatus(['Sparks Fly'], 'Hatch Repairs');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for Doctor\'s Orders when on Safe Passage branch', () => {
            const result = tracker.getStatus(['Sparks Fly'], 'Doctor\'s Orders');
            expect(result).toBe(QuestStatus.TBD);
        });

        // On A Balanced Harvest branch, After Rain Comes branch should be TBD

        it('should return TBD for After Rain Comes when on A Balanced Harvest branch', () => {
            const result = tracker.getStatus(['The Root Of The Matter'], 'After Rain Comes');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for Water Troubles when on A Balanced Harvest branch', () => {
            const result = tracker.getStatus(['The Root Of The Matter'], 'Water Troubles');
            expect(result).toBe(QuestStatus.TBD);
        });

        // On Straight Record branch, Marked For Death branch should be TBD

        it('should return TBD for Marked For Death when on Straight Record branch', () => {
            const result = tracker.getStatus(['Echoes Of Victory Ridge'], 'Marked For Death');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for Industrial Espionage when on Straight Record branch only', () => {
            const result = tracker.getStatus(['Echoes Of Victory Ridge'], 'Industrial Espionage');
            expect(result).toBe(QuestStatus.TBD);
        });

        // On Celeste's Journals branch, Out Of The Shadows branch should be TBD

        it('should return TBD for Out Of The Shadows when on Celeste\'s Journals branch', () => {
            const result = tracker.getStatus(['Back On Top'], 'Out Of The Shadows');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for The Major\'s Footlocker when on Celeste\'s Journals branch', () => {
            const result = tracker.getStatus(['Groundbreaking'], 'The Major\'s Footlocker');
            expect(result).toBe(QuestStatus.TBD);
        });

        // On Turnabout branch, A New Type Of Plant should be TBD

        it('should return TBD for A New Type Of Plant when on Turnabout', () => {
            const result = tracker.getStatus(['Turnabout'], 'A New Type Of Plant');
            expect(result).toBe(QuestStatus.TBD);
        });

        // On The Clean Dream, Armored Transports should be TBD (missing A New Type Of Plant)

        it('should return TBD for Armored Transports when on The Clean Dream only', () => {
            const result = tracker.getStatus(['The Clean Dream'], 'Armored Transports');
            expect(result).toBe(QuestStatus.TBD);
        });
    });

    // ============================================================
    // UNKNOWN STATUS
    // ============================================================
    describe('UNKNOWN Status', () => {
        it('should return UNKNOWN for completely unknown quest', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'Nonexistent Quest');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });

        it('should return UNKNOWN for misspelled quest name', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'A Bad Feling');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });

        it('should return UNKNOWN for empty string quest', () => {
            const result = tracker.getStatus(['A Bad Feeling'], '');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });

        it('should return UNKNOWN for quest with different casing', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'a bad feeling');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });

        it('should return UNKNOWN for quest with extra spaces', () => {
            const result = tracker.getStatus(['A Bad Feeling'], 'A Bad  Feeling');
            expect(result).toBe(QuestStatus.UNKNOWN);
        });
    });

    // ============================================================
    // EDGE CASES
    // ============================================================
    describe('Edge Cases', () => {
        it('should return TBD for root quest with empty active list', () => {
            const result = tracker.getStatus([], 'Picking Up The Pieces');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should return TBD for any quest with empty active list', () => {
            const result = tracker.getStatus([], 'A Bad Feeling');
            expect(result).toBe(QuestStatus.TBD);
        });

        it('should handle multiple active quests from different branches', () => {
            // Player has completed both branches leading to a convergent quest
            const result = tracker.getStatus(['Mixed Signals', 'Keeping The Memory'], 'Dormant Barons');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should mark ancestors of multiple active quests as DONE', () => {
            // Both active quests share A Bad Feeling as ancestor
            expect(tracker.getStatus(['Sparks Fly', 'Greasing Her Palms'], 'A Bad Feeling')).toBe(QuestStatus.DONE);
        });

        it('should handle active quests from completely separate chains', () => {
            // One from Dam Battlegrounds, one from Blue Gate
            expect(tracker.getStatus(['A Bad Feeling', 'A First Foothold'], 'Picking Up The Pieces')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(['A Bad Feeling', 'A First Foothold'], 'A First Foothold')).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should correctly identify DONE when one path complete for convergent quest prerequisite', () => {
            // On Echoes Of Victory Ridge, Broken Monument should be DONE
            const result = tracker.getStatus(['Echoes Of Victory Ridge'], 'Broken Monument');
            expect(result).toBe(QuestStatus.DONE);
        });

        it('should handle deeply nested quest status checks', () => {
            // From the very end, check the very beginning
            const result = tracker.getStatus(['Groundbreaking'], 'Off The Radar');
            expect(result).toBe(QuestStatus.DONE);
        });
    });

    // ============================================================
    // MULTIPLE ACTIVE QUESTS SCENARIOS
    // ============================================================
    describe('Multiple Active Quests', () => {
        it('should handle player on multiple parallel late-game quests', () => {
            const activeQuests = ['Tribute To Toledo', 'A Toxic Trail', 'Digging Up Dirt'];
            expect(tracker.getStatus(activeQuests, 'Life Of A Pharmacist')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(activeQuests, 'Tribute To Toledo')).toBe(QuestStatus.IN_PROGRESS);
            expect(tracker.getStatus(activeQuests, 'A Toxic Trail')).toBe(QuestStatus.IN_PROGRESS);
            expect(tracker.getStatus(activeQuests, 'Digging Up Dirt')).toBe(QuestStatus.IN_PROGRESS);
        });

        it('should handle simultaneous progress on both convergent branches', () => {
            // Player doing both branches that lead to Unexpected Initiative
            const activeQuests = ['Keeping The Memory', 'Eyes On The Prize'];
            expect(tracker.getStatus(activeQuests, 'Broken Monument')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(activeQuests, 'Straight Record')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(activeQuests, 'Marked For Death')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(activeQuests, 'Market Correction')).toBe(QuestStatus.DONE);
            expect(tracker.getStatus(activeQuests, 'Unexpected Initiative')).toBe(QuestStatus.TBD);
        });

        it('should handle active quest and its child both being checked', () => {
            const activeQuests = ['A Bad Feeling'];
            expect(tracker.getStatus(activeQuests, 'A Bad Feeling')).toBe(QuestStatus.IN_PROGRESS);
            expect(tracker.getStatus(activeQuests, 'Safe Passage')).toBe(QuestStatus.TBD);
            expect(tracker.getStatus(activeQuests, 'Off The Radar')).toBe(QuestStatus.DONE);
        });

        it('should handle three separate starting chains active', () => {
            const activeQuests = ['Picking Up The Pieces', 'In My Image', 'A First Foothold'];
            expect(tracker.getStatus(activeQuests, 'Picking Up The Pieces')).toBe(QuestStatus.IN_PROGRESS);
            expect(tracker.getStatus(activeQuests, 'In My Image')).toBe(QuestStatus.IN_PROGRESS);
            expect(tracker.getStatus(activeQuests, 'A First Foothold')).toBe(QuestStatus.IN_PROGRESS);
        });
    });

    // ============================================================
    // SPECIFIC QUEST CHAIN TESTS
    // ============================================================
    describe('Specific Quest Chains - Doctor\'s Orders Path', () => {
        const doctorsOrdersChain = [
            'Doctor\'s Orders',
            'Medical Merchandise',
            'A Reveal In Ruins',
            'A Lay Of The Land',
            'Eyes In The Sky',
            'After Rain Comes',
            'Water Troubles',
            'Source Of The Contaminant',
            'Switching The Supply',
            'A Warm Place To Rest',
            'Prescriptions Of The Past',
            'Power Out',
            'Flickering Threat',
            'Bees!',
            'Espresso',
            'Life Of A Pharmacist'
        ];

        it('should correctly trace the entire Doctor\'s Orders chain', () => {
            for (let i = 1; i < doctorsOrdersChain.length; i++) {
                const activeQuest = doctorsOrdersChain[i];
                const ancestorQuest = doctorsOrdersChain[i - 1];
                const result = tracker.getStatus([activeQuest], ancestorQuest);
                expect(result).toBe(QuestStatus.DONE);
            }
        });

        it('should mark all earlier quests as DONE when at end of chain', () => {
            for (const quest of doctorsOrdersChain.slice(0, -1)) {
                const result = tracker.getStatus(['Life Of A Pharmacist'], quest);
                expect(result).toBe(QuestStatus.DONE);
            }
        });
    });

    describe('Specific Quest Chains - Trifecta to Groundbreaking Path', () => {
        const trifectaToGroundbreakingChain = [
            'The Trifecta',
            'Dormant Barons',
            'Broken Monument',
            'Straight Record',
            'Keeping The Memory',
            'Echoes Of Victory Ridge',
            // Note: Unexpected Initiative requires Industrial Espionage too
        ];

        it('should correctly trace Trifecta to Echoes Of Victory Ridge', () => {
            for (let i = 1; i < trifectaToGroundbreakingChain.length; i++) {
                const activeQuest = trifectaToGroundbreakingChain[i];
                const ancestorQuest = trifectaToGroundbreakingChain[i - 1];
                const result = tracker.getStatus([activeQuest], ancestorQuest);
                expect(result).toBe(QuestStatus.DONE);
            }
        });

        const industrialEspionageChain = [
            'Broken Monument',
            'Marked For Death',
            'Market Correction',
            'Eyes On The Prize',
            'Industrial Espionage'
        ];

        it('should correctly trace Broken Monument to Industrial Espionage', () => {
            for (let i = 1; i < industrialEspionageChain.length; i++) {
                const activeQuest = industrialEspionageChain[i];
                const ancestorQuest = industrialEspionageChain[i - 1];
                const result = tracker.getStatus([activeQuest], ancestorQuest);
                expect(result).toBe(QuestStatus.DONE);
            }
        });
    });

    describe('Specific Quest Chains - Blue Gate Path', () => {
        const blueGateChain = [
            'A First Foothold',
            'Reduced To Rubble',
            'With A Trace',
            'The Clean Dream'
        ];

        it('should correctly trace Blue Gate chain', () => {
            for (let i = 1; i < blueGateChain.length; i++) {
                const activeQuest = blueGateChain[i];
                const ancestorQuest = blueGateChain[i - 1];
                const result = tracker.getStatus([activeQuest], ancestorQuest);
                expect(result).toBe(QuestStatus.DONE);
            }
        });

        it('should not confuse Blue Gate chain with main Dam chain', () => {
            // Being on Blue Gate chain doesn't mean Dam quests are done
            expect(tracker.getStatus(['The Clean Dream'], 'A Bad Feeling')).toBe(QuestStatus.TBD);
            expect(tracker.getStatus(['The Clean Dream'], 'Picking Up The Pieces')).toBe(QuestStatus.TBD);
        });
    });

    // ============================================================
    // QUEST TREE INTEGRITY TESTS
    // ============================================================
    describe('Quest Tree Integrity', () => {
        it('should have all prerequisite quests defined in tree', () => {
            for (const [quest, prerequisites] of Object.entries(QUEST_TREE)) {
                for (const prereq of prerequisites) {
                    // Each prerequisite should either be a key or the tree is invalid
                    const isKey = prereq in QUEST_TREE;
                    expect(isKey).toBe(true);
                }
            }
        });

        it('should not have circular dependencies', () => {
            const checkCycle = (quest, visited = new Set()) => {
                if (visited.has(quest)) return true; // Cycle detected
                visited.add(quest);
                const prereqs = QUEST_TREE[quest] || [];
                for (const prereq of prereqs) {
                    if (checkCycle(prereq, new Set(visited))) return true;
                }
                return false;
            };

            for (const quest of Object.keys(QUEST_TREE)) {
                expect(checkCycle(quest)).toBe(false);
            }
        });

        it('should have exactly 3 root quests (empty prerequisites)', () => {
            const rootQuests = Object.entries(QUEST_TREE)
                .filter(([, prereqs]) => prereqs.length === 0)
                .map(([quest]) => quest);

            expect(rootQuests).toContain('Picking Up The Pieces');
            expect(rootQuests).toContain('A First Foothold');
            expect(rootQuests.length).toBe(2); // In My Image has A Bad Feeling as prereq
        });

        it('should have exactly 3 quests with multiple prerequisites', () => {
            const multiPrereqQuests = Object.entries(QUEST_TREE)
                .filter(([, prereqs]) => prereqs.length > 1)
                .map(([quest]) => quest);

            expect(multiPrereqQuests).toContain('Off The Radar');
            expect(multiPrereqQuests).toContain('Unexpected Initiative');
            expect(multiPrereqQuests).toContain('Armored Transports');
            expect(multiPrereqQuests.length).toBe(3);
        });
    });
});
