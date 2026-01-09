import { ItemDatabase } from './item-database';
import { QuestTracker } from './quest-tracker';
import { Action, QuestStatus } from './constants';

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
        this.ready = false;
        this.userProgress = { activeQuestTitles: [], stationLevels: {} };
    }

    async init() {
        await Promise.all([this.db.load(), this.questTracker.load()]);
        this.ready = true;
    }

    analyzeItem(itemIdOrName, progress = {}) {
        if (!this.ready) return this._returnError("Engine loading...");

        const node = this.db.getItem(itemIdOrName);
        if (!node) return this._returnError(`Item '${itemIdOrName}' not found`);

        const itemType = (node.type || "").toLowerCase();
        
        console.groupCollapsed(`[Advisor] Analyzing: ${node.name}`);
        console.log(`Type: ${itemType} | ID: ${node.id}`);

        const activeQuests = progress.activeQuestTitles || [];
        const stationLevels = progress.stationLevels || {};

        // ---------------------------------------------------------
        // 1. Calculate Economics
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

        const economics = {
            directSellValue: directVal,
            recycleYieldValue: recycleVal,
            ratio: parseFloat(ratio.toFixed(2))
        };

        console.log(`Econ Calc: Sell(${directVal}) vs Recycle(${recycleVal}) | Ratio: ${economics.ratio} | Result: ${econCalcResult}`);

        // ---------------------------------------------------------
        // 2. Determine "Base" Action based on Item Type
        // ---------------------------------------------------------
        let baseAction = Action.PREFERENCE; 
        let baseReason = "";

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
                if (economics.recycleYieldValue === 0) {
                    baseReason = "Sell (Cannot be recycled)";
                } else {
                    baseReason = `Sell (High Value: ${economics.ratio}x)`;
                }
            } else {
                // FALLBACK: Value wasn't high enough to force a Sell.
                // We default to PREFERENCE so user decides if they need Mats or Cash.
                baseAction = Action.PREFERENCE;
                // FIX: Cleaner rationale message
                baseReason = "User Preference (Material vs Cash)";
            }
        }

        console.log(`Base Action: ${baseAction} (Reason: ${baseReason})`);

        // ---------------------------------------------------------
        // 3. Check Requirements (Quests/Stations)
        // ---------------------------------------------------------
        const keepReasons = [];
        const questStrings = [];
        const stationStrings = [];

        // --- Quests ---
        const reqQuests = node.raw.requiredForQuests || [];
        for (const req of reqQuests) {
            const qTitle = req.quest?.title;
            const amount = req.amount || 1;
            
            if (qTitle) {
                const status = this.questTracker.getStatus(activeQuests, qTitle);
                if (status === QuestStatus.IN_PROGRESS || status === QuestStatus.TBD) {
                    const priority = status === QuestStatus.IN_PROGRESS ? 1 : 2;
                    keepReasons.push({ source: `Quest: ${qTitle}`, amount, priority });
                    questStrings.push(`${qTitle} (${amount})`);
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
                    keepReasons.push({ source: `Station: ${stName}`, amount, priority: 1 });
                    stationStrings.push(`${stName} Tier ${stTier} (${amount})`);
                }
            }
        }

        // ---------------------------------------------------------
        // 4. Formulate Result
        // ---------------------------------------------------------
        const craftingOptions = this._getCraftingTree(node);
        let primaryAction = baseAction;
        let totalKeep = 0;
        const summaryLines = [];

        if (keepReasons.length > 0) {
            primaryAction = Action.KEEP;
            totalKeep = keepReasons.reduce((sum, r) => sum + r.amount, 0);
            
            if (stationStrings.length > 0) summaryLines.push(`Stations: ${stationStrings.join(", ")}`);
            if (questStrings.length > 0) summaryLines.push(`Quests: ${questStrings.join(", ")}`);
            summaryLines.push(`Surplus: ${baseReason}`);
        } else {
            summaryLines.push(`Action: ${baseReason}`);
            
            if (craftingOptions.length > 0) {
                const uniqueCrafts = [...new Set(craftingOptions.map(c => c.details))].sort();
                summaryLines.push(`Potential Use: ${uniqueCrafts.slice(0, 3).join(" | ")}`);
            }
        }

        console.log(`>> FINAL DECISION: ${primaryAction} <<`);
        console.groupEnd();

        return {
            itemId: node.id,
            itemName: node.name,
            primaryAction,
            keepReasons,
            craftingOptions,
            totalAmountToKeep: totalKeep,
            economics,
            summary: summaryLines.join("<br>") 
        };
    }

    _getCraftingTree(node) {
        const options = [];
        const craftsInto = node.craftsInto || [];
        craftsInto.forEach(prodId => {
            const prod = this.db.items[prodId];
            if (prod) options.push({ resultName: prod.name, type: "Direct", details: `Used to craft ${prod.name}` });
        });
        const yieldsFromRecycle = node.yieldsFromRecycle || {};
        for (const [compId] of Object.entries(yieldsFromRecycle)) {
            const compNode = this.db.items[compId];
            if (compNode && Array.isArray(compNode.craftsInto)) {
                compNode.craftsInto.forEach(prodId => {
                    const prod = this.db.items[prodId];
                    if (prod) options.push({ resultName: prod.name, type: "Via Recycle", details: `Recycle -> ${compNode.name} -> Craft ${prod.name}` });
                });
            }
        }
        return options;
    }

    _returnError(msg) {
        console.error(`[Advisor Error] ${msg}`);
        return {
            itemId: "error",
            itemName: "Error",
            primaryAction: Action.UNKNOWN,
            summary: msg
        };
    }

    formatDecisionOutput(result) {
        let color = "#ffffff";
        let actionStr = "UNKNOWN";
        
        switch (result.primaryAction) {
            case Action.KEEP:
                color = "#00ff00"; 
                actionStr = `KEEP (${result.totalAmountToKeep})`;
                break;
            case Action.SELL:
                color = "#ffd700"; 
                actionStr = "SELL";
                break;
            case Action.RECYCLE:
                color = "#ff8c00"; 
                actionStr = "RECYCLE";
                break;
            case Action.PREFERENCE:
                color = "#33b5e5"; 
                actionStr = "PREFERENCE";
                break;
            default:
                color = "#888888";
        }

        let html = `
        <div style='margin-bottom: 5px;'>
            <span style='color: white; font-weight: bold; font-size: 14px;'>[${result.itemName}]</span><br>
            Action: <span style='color: ${color}; font-weight: bold; font-size: 14px;'>${actionStr}</span><br>
            <span style='color: #aaaaaa; font-style: italic; font-size: 12px; line-height: 1.4;'>${result.summary}</span>
        `;

        if (result.craftingOptions && result.craftingOptions.length > 0) {
            html += `<div style='margin-top: 8px; border-top: 1px solid #444; padding-top: 4px;'>`;
            html += `<span style='color: #00bcd4; font-weight: bold; font-size: 12px;'>Used For:</span><br>`;

            for (let i = 0; i < result.craftingOptions.length; i++) {
                if (i >= 4) {
                    html += `<span style='color: #666; font-size: 10px;'>+ ${result.craftingOptions.length - 4} more...</span>`;
                    break;
                }
                const opt = result.craftingOptions[i];
                const typeColor = opt.type === "Direct" ? "#888" : "#d81b60"; 
                html += `<span style='color: #e0e0e0; font-size: 12px;'>• ${opt.resultName}</span> `;
                html += `<span style='color: ${typeColor}; font-size: 10px;'>(${opt.type})</span><br>`;
            }
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }
}