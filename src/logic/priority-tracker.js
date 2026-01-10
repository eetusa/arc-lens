/**
 * PriorityTracker - Manages priority checking for items
 *
 * Supports two sources of priorities:
 * - Developer-managed (from priorities.json)
 * - User-managed (from localStorage via userProgress)
 *
 * Each priority can match items through:
 * - direct: The item itself is prioritized
 * - craftTo: Items that craft INTO the prioritized item
 * - recycleTo: Items that recycle INTO the prioritized item
 */
export class PriorityTracker {
    constructor(itemDatabase) {
        this.db = itemDatabase;
        this.devPriorities = [];
        this.userPriorities = [];
        this.devEnabled = true;
        this.userEnabled = true;
        this.isLoaded = false;
    }

    /**
     * Load developer priorities from priorities.json
     */
    async loadDevPriorities() {
        try {
            const response = await fetch('/priorities.json');
            const data = await response.json();
            this.devPriorities = data.priorities || [];
            this.isLoaded = true;
            console.log(`PriorityTracker: Loaded ${this.devPriorities.length} developer priorities`);
        } catch (e) {
            console.error("PriorityTracker: Failed to load priorities.json", e);
            this.devPriorities = [];
            this.isLoaded = true;
        }
    }

    /**
     * Set user priorities from external source (localStorage)
     */
    setUserPriorities(priorities) {
        this.userPriorities = priorities || [];
    }

    /**
     * Toggle developer priorities on/off
     */
    setDevEnabled(enabled) {
        this.devEnabled = enabled;
    }

    /**
     * Toggle user priorities on/off
     */
    setUserEnabled(enabled) {
        this.userEnabled = enabled;
    }

    /**
     * Update all settings at once (called from worker)
     */
    updateSettings(settings) {
        if (settings.devPrioritiesEnabled !== undefined) {
            this.devEnabled = settings.devPrioritiesEnabled;
        }
        if (settings.userPrioritiesEnabled !== undefined) {
            this.userEnabled = settings.userPrioritiesEnabled;
        }
        if (settings.userPriorities !== undefined) {
            this.userPriorities = settings.userPriorities;
        }
    }

    /**
     * Check if an item matches any priority rules
     * @param {Object} itemNode - The item node from ItemDatabase
     * @returns {Object} { isPrioritized: boolean, matches: Array }
     */
    checkItem(itemNode) {
        if (!itemNode) {
            return { isPrioritized: false, matches: [] };
        }

        const matches = [];

        // Get all active priorities
        const activePriorities = [];
        if (this.devEnabled) {
            this.devPriorities.forEach(p => activePriorities.push({ ...p, source: 'developer' }));
        }
        if (this.userEnabled) {
            this.userPriorities.forEach(p => activePriorities.push({ ...p, source: 'user' }));
        }

        for (const priority of activePriorities) {
            // Direct match: item ID matches priority
            if (priority.direct && itemNode.id === priority.itemId) {
                matches.push({
                    targetItemId: priority.itemId,
                    targetItemName: priority.itemName,
                    matchType: 'direct',
                    source: priority.source
                });
            }

            // Craft-to match: this item crafts INTO the priority item
            if (priority.craftTo && itemNode.craftsInto && itemNode.craftsInto.includes(priority.itemId)) {
                matches.push({
                    targetItemId: priority.itemId,
                    targetItemName: priority.itemName,
                    matchType: 'craft-to',
                    source: priority.source
                });
            }

            // Recycle-to match: this item recycles INTO the priority item
            if (priority.recycleTo && itemNode.yieldsFromRecycle && itemNode.yieldsFromRecycle[priority.itemId]) {
                matches.push({
                    targetItemId: priority.itemId,
                    targetItemName: priority.itemName,
                    matchType: 'recycle-to',
                    source: priority.source
                });
            }
        }

        return {
            isPrioritized: matches.length > 0,
            matches
        };
    }
}
