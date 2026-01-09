import { QuestStatus } from './constants';

export class QuestTracker {
    constructor() {
        this.questTree = {};
        this.isLoaded = false;
    }

    async load() {
        try {
            const response = await fetch('/quests.json');
            this.questTree = await response.json();
            this.isLoaded = true;
            console.log("QuestTracker: Loaded");
        } catch (e) {
            console.error("QuestTracker: Failed to load quests.json", e);
        }
    }

    getStatus(activeQuests, targetQuest) {
        if (!this.isLoaded) return QuestStatus.UNKNOWN;
        
        // 0. Validate input exists in tree (check values/parents)
        let isKnown = false;
        if (this.questTree[targetQuest]) {
            isKnown = true;
        } else {
            // Check if it exists as a parent in any value list
            for (const parents of Object.values(this.questTree)) {
                if (parents.includes(targetQuest)) {
                    isKnown = true;
                    break;
                }
            }
        }
        
        // Special case for root knowns if needed, otherwise:
        if (!isKnown && targetQuest !== "DAM BATTLEGROUNDS UNLOCKED") {
            return QuestStatus.UNKNOWN;
        }

        // 1. Check active
        if (activeQuests.includes(targetQuest)) return QuestStatus.IN_PROGRESS;

        // 2. Check Ancestry
        if (this._isAncestorOfActive(activeQuests, targetQuest)) return QuestStatus.DONE;

        // 3. Default
        return QuestStatus.TBD;
    }

    _isAncestorOfActive(activeQuests, target) {
        const visited = new Set();

        const searchUpwards = (current) => {
            if (current === target) return true;
            if (visited.has(current)) return false;
            visited.add(current);

            const parents = this.questTree[current] || [];
            for (const p of parents) {
                if (searchUpwards(p)) return true;
            }
            return false;
        };

        for (const q of activeQuests) {
            if (searchUpwards(q)) return true;
        }
        return false;
    }
}