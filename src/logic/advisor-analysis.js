import { Action } from './constants';

export class AdvisorAnalysis {
    constructor(itemNode) {
        // 1. Meta Data
        this.meta = {
            id: itemNode.id,
            name: itemNode.name,
            type: (itemNode.type || "misc").toLowerCase(),
            // --- UPDATED: Use Rarity instead of Tier ---
            rarity: itemNode.rarity || 'common',
            // Keep tier only if it genuinely exists (e.g. for specific upgrades), otherwise undefined
            tier: itemNode.tier 
        };

        // 2. Verdict (Decision)
        this.verdict = {
            action: Action.UNKNOWN,
            actionLabel: "Unknown",
            reason: "",
            colorToken: "neutral",
            quantityToKeep: 0
        };

        // 3. Economics
        this.economics = {
            sellPrice: 0,
            recyclePrice: 0,
            ratio: 0,
            bestAction: Action.SELL
        };

        // 4. Demand (Quests & Stations)
        this.demand = {
            totalRequired: 0,
            quests: [],
            stations: []
        };

        // 5. Utility (Crafting)
        this.utility = {
            craftingOptions: [] 
        };
    }

    setVerdict(action, amount = 0, reason = "") {
        this.verdict.action = action;
        this.verdict.quantityToKeep = amount;
        this.verdict.reason = reason;

        switch (action) {
            case Action.KEEP:
                this.verdict.actionLabel = amount > 0 ? `KEEP (${amount})` : "KEEP";
                this.verdict.colorToken = "success";
                break;
            case Action.SELL:
                this.verdict.actionLabel = "SELL";
                this.verdict.colorToken = "warning";
                break;
            case Action.RECYCLE:
                this.verdict.actionLabel = "RECYCLE";
                this.verdict.colorToken = "danger";
                break;
            case Action.PREFERENCE:
                this.verdict.actionLabel = "PREFERENCE";
                this.verdict.colorToken = "info";
                break;
            default:
                this.verdict.actionLabel = "UNKNOWN";
                this.verdict.colorToken = "neutral";
        }
    }

    addQuestRequirement(title, amount, status, priority) {
        this.demand.quests.push({ title, amount, status, priority });
        this.demand.totalRequired += amount;
    }

    addStationRequirement(name, tier, amount) {
        this.demand.stations.push({ name, tier, amount });
        this.demand.totalRequired += amount;
    }

    addCraftingOption(resultName, type, details) {
        this.utility.craftingOptions.push({ 
            resultName, 
            type, 
            details 
        });
    }
}