import { ItemDatabase } from './item-database';
import { QuestTracker } from './quest-tracker';
import { PriorityTracker } from './priority-tracker';
import { ProjectTracker } from './project-tracker';
import { Action, QuestStatus } from './constants';
import { AdvisorAnalysis } from './advisor-analysis';

// Define Categories
const TYPES_PREFERENCE = new Set([
    'LMG', 'SMG', 'ammunition', 'assault rifle', 'augment', 'battle rifle', 
    'blueprint', 'hand cannon', 'modification', 'nature', 'pistol', 
    'quick use', 'shield', 'shotgun', 'sniper rifle'
]);

const TYPES_ALWAYS_KEEP = new Set([
    'key', 'special'
]);

export class AdvisorEngine {
    constructor() {
        this.db = new ItemDatabase();
        this.questTracker = new QuestTracker();
        this.priorityTracker = new PriorityTracker(this.db);
        this.projectTracker = new ProjectTracker();
        this.ready = false;
        this.defaultProgress = { activeQuestTitles: [], stationLevels: {}, projectPhase: 0 };
    }

    async init() {
        await Promise.all([
            this.db.load(),
            this.questTracker.load(),
            this.priorityTracker.loadDevPriorities(),
            this.projectTracker.load()
        ]);
        this.ready = true;
    }

    updatePrioritySettings(settings) {
        this.priorityTracker.updateSettings(settings);
    }

    analyzeItem(itemIdOrName, progress = {}) {
        if (!this.ready) return this._returnError("Engine loading...", itemIdOrName);

        const node = this.db.getItem(itemIdOrName);
        if (!node) return this._returnError(`Item '${itemIdOrName}' not found`, itemIdOrName);

        const userProgress = { ...this.defaultProgress, ...progress };
        const activeQuests = userProgress.activeQuestTitles || [];
        const stationLevels = userProgress.stationLevels || {};

        // 1. Initialize Analysis Object
        const analysis = new AdvisorAnalysis(node);

        // ---------------------------------------------------------
        // 2. Calculate Economics
        // ---------------------------------------------------------
        const SELL_THRESHOLD = 4.0;
        const directVal = node.value || 0;
        const recycleVal = this.db.getRecycleValue(node.id) || 0;
        
        let econCalcResult = Action.RECYCLE; 
        let ratio = 0.0;

        if (recycleVal === 0) {
            econCalcResult = Action.SELL;
            ratio = 0;
        } else if (directVal > (recycleVal * SELL_THRESHOLD)) {
            econCalcResult = Action.SELL;
            ratio = directVal / recycleVal;
        } else {
            econCalcResult = Action.RECYCLE;
            ratio = recycleVal > 0 ? directVal / recycleVal : 0;
        }

        analysis.economics = {
            sellPrice: directVal,
            recyclePrice: recycleVal,
            ratio: parseFloat(ratio.toFixed(2)),
            bestAction: econCalcResult
        };

        // ---------------------------------------------------------
        // 3. Determine "Base" Action based on Item Type
        // ---------------------------------------------------------
        let baseAction = Action.PREFERENCE; 
        let baseReason = "";
        const itemType = analysis.meta.type;

        if (TYPES_ALWAYS_KEEP.has(itemType)) {
            baseAction = Action.KEEP;
            baseReason = "Crucial Item (Key/Special)";
        } 
        else if (TYPES_PREFERENCE.has(itemType)) {
            baseAction = Action.PREFERENCE;
            baseReason = "User Preference (Gear/Ammo)";
        } 
        else {
            // Conditional Types (Materials, Trinkets, etc.)
            if (econCalcResult === Action.SELL) {
                baseAction = Action.SELL;
                if (recycleVal === 0) {
                    baseReason = "Sell (Cannot be recycled)";
                } else {
                    baseReason = `Sell (High Value: ${analysis.economics.ratio}x)`;
                }
            } else {
                baseAction = Action.PREFERENCE;
                baseReason = "User Preference (Material vs Cash)";
            }
        }

        // ---------------------------------------------------------
        // 4. Check Requirements (Quests/Stations)
        // ---------------------------------------------------------

        // --- Quests ---
        const reqQuests = node.raw.requiredForQuests || [];
        for (const req of reqQuests) {
            const qTitle = req.quest?.title;
            const amount = req.amount || 1;
            
            if (qTitle) {
                const status = this.questTracker.getStatus(activeQuests, qTitle);
                if (status === QuestStatus.IN_PROGRESS || status === QuestStatus.TBD) {
                    const priority = status === QuestStatus.IN_PROGRESS ? 1 : 2;
                    analysis.addQuestRequirement(qTitle, amount, status, priority);
                }
            }
        }

        // --- Stations ---
        const reqStations = node.raw.requiredForStation || [];
        for (const req of reqStations) {
            const stName = req.station?.name;
            const stTier = req.station?.tier || 1;
            const amount = req.amount || 1;

            if (stName) {
                const current = stationLevels[stName] || 0;
                if (current < stTier) {
                    analysis.addStationRequirement(stName, stTier, amount);
                }
            }
        }

        // --- Projects ---
        const projectPhase = userProgress.projectPhase || 0;
        const projectNeed = this.projectTracker.isItemNeeded(node.name, projectPhase);
        if (projectNeed.needed) {
            analysis.addProjectRequirement(projectNeed.phase, projectNeed.phaseId, projectNeed.amount);
        }

        // ---------------------------------------------------------
        // 5. Fill Crafting Utility
        // ---------------------------------------------------------
        const craftingOptions = this._getCraftingTree(node);
        craftingOptions.forEach(opt => {
            analysis.addCraftingOption(opt.resultName, opt.type, opt.details);
        });

        // ---------------------------------------------------------
        // 6. Check Prioritization
        // ---------------------------------------------------------
        const priorityResult = this.priorityTracker.checkItem(node);
        analysis.setPrioritization(priorityResult);

        // ---------------------------------------------------------
        // 7. Fill Recycle Outputs
        // ---------------------------------------------------------
        const yieldsFromRecycle = node.yieldsFromRecycle || {};
        for (const [outputId, amount] of Object.entries(yieldsFromRecycle)) {
            const outputNode = this.db.items[outputId];
            if (outputNode) {
                const rarity = outputNode.rarity || 'common';
                const isPrioritized = this.priorityTracker.isRecycleOutputPrioritized(outputId);
                analysis.addRecycleOutput(outputId, outputNode.name, amount, rarity, isPrioritized);
            }
        }

        // ---------------------------------------------------------
        // 8. Formulate Final Verdict
        // ---------------------------------------------------------
        
        if (analysis.demand.totalRequired > 0) {
            // Force KEEP if we have hard requirements
            const questCount = analysis.demand.quests.length;
            const stationCount = analysis.demand.stations.length;
            const projectCount = analysis.demand.projects.length;
            let reasonParts = [];

            if (questCount > 0) reasonParts.push(`${questCount} Quest${questCount > 1 ? 's' : ''}`);
            if (stationCount > 0) reasonParts.push(`${stationCount} Upgrade${stationCount > 1 ? 's' : ''}`);
            if (projectCount > 0) reasonParts.push(`${projectCount} Project Phase${projectCount > 1 ? 's' : ''}`);

            analysis.setVerdict(Action.KEEP, analysis.demand.totalRequired, reasonParts.join(" & "));
        } else {
            // Fallback to the base economic/preference decision
            analysis.setVerdict(baseAction, 0, baseReason);
        }

        return analysis;
    }

    _getCraftingTree(node) {
        const options = [];
        const craftsInto = node.craftsInto || [];
        
        // Direct Crafting
        craftsInto.forEach(prodId => {
            const prod = this.db.items[prodId];
            if (prod) {
                options.push({ 
                    resultName: prod.name, 
                    type: "Direct", 
                    details: `Used to craft ${prod.name}` 
                });
            }
        });

        // Recycle -> Craft
        const yieldsFromRecycle = node.yieldsFromRecycle || {};
        for (const [compId] of Object.entries(yieldsFromRecycle)) {
            const compNode = this.db.items[compId];
            if (compNode && Array.isArray(compNode.craftsInto)) {
                compNode.craftsInto.forEach(prodId => {
                    const prod = this.db.items[prodId];
                    if (prod) {
                        options.push({ 
                            resultName: prod.name, 
                            type: "Via Recycle", 
                            details: `Recycle -> ${compNode.name} -> Craft ${prod.name}` 
                        });
                    }
                });
            }
        }
        
        // Sort to put Direct crafts first
        return options.sort((a, b) => (a.type === "Direct" ? -1 : 1));
    }

    _returnError(msg, itemName = "Unknown") {
        console.error(`[Advisor Error] ${msg}`);
        const errorNode = { id: "error", name: itemName, value: 0, type: "error" };
        const analysis = new AdvisorAnalysis(errorNode);
        analysis.setVerdict(Action.UNKNOWN, 0, msg);
        return analysis;
    }
}