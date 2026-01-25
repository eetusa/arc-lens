/**
 * ProjectTracker - Tracks expedition/project phases and item requirements
 *
 * Loads project data from projects.json and provides methods to check
 * if items are needed for upcoming phases.
 */
export class ProjectTracker {
    constructor() {
        this.projectData = null;
        this.isLoaded = false;
    }

    async load() {
        try {
            const response = await fetch('/projects.json');
            this.projectData = await response.json();
            this.isLoaded = true;
            console.log("ProjectTracker: Loaded");
        } catch (e) {
            console.error("ProjectTracker: Failed to load projects.json", e);
        }
    }

    /**
     * Get current project info
     * @returns {Object|null} Current project data
     */
    getCurrentProject() {
        return this.projectData?.currentProject || null;
    }

    /**
     * Get all phases for the current project
     * @returns {Array} Array of phase objects
     */
    getPhases() {
        return this.projectData?.currentProject?.phases || [];
    }

    /**
     * Get requirements for a specific phase
     * @param {number} phaseId - Phase ID (1-6)
     * @returns {Array} Array of requirement objects
     */
    getRequirementsForPhase(phaseId) {
        const phase = this.getPhases().find(p => p.id === phaseId);
        return phase?.requirements || [];
    }

    /**
     * Check if an item is needed in any phase after the user's current phase
     * @param {string} itemName - Item name to check
     * @param {number} currentPhase - User's current completed phase (0 = not started)
     * @returns {Object} { needed: boolean, phase?: string, phaseId?: number, amount?: number }
     */
    isItemNeeded(itemName, currentPhase) {
        if (!this.isLoaded) {
            return { needed: false };
        }

        const phases = this.getPhases();
        const normalizedItemName = itemName.toLowerCase().trim();

        for (const phase of phases) {
            // Skip completed phases (phases at or below current phase)
            if (phase.id <= currentPhase) continue;

            // Skip phases with only coin requirements (no item requirements)
            if (!phase.requirements || phase.requirements.length === 0) continue;

            // Check if this item is required for this phase
            const req = phase.requirements.find(r =>
                r.item.toLowerCase().trim() === normalizedItemName
            );

            if (req) {
                return {
                    needed: true,
                    phase: phase.name,
                    phaseId: phase.id,
                    amount: req.amount
                };
            }
        }

        return { needed: false };
    }

    /**
     * Get all items needed for phases after the current phase
     * @param {number} currentPhase - User's current completed phase (0 = not started)
     * @returns {Array} Array of { itemName, phase, phaseId, amount }
     */
    getAllNeededItems(currentPhase) {
        if (!this.isLoaded) {
            return [];
        }

        const neededItems = [];
        const phases = this.getPhases();

        for (const phase of phases) {
            if (phase.id <= currentPhase) continue;
            if (!phase.requirements) continue;

            for (const req of phase.requirements) {
                neededItems.push({
                    itemName: req.item,
                    phase: phase.name,
                    phaseId: phase.id,
                    amount: req.amount
                });
            }
        }

        return neededItems;
    }

    /**
     * Get total amount of a specific item needed across all remaining phases
     * @param {string} itemName - Item name to check
     * @param {number} currentPhase - User's current completed phase
     * @returns {number} Total amount needed
     */
    getTotalAmountNeeded(itemName, currentPhase) {
        if (!this.isLoaded) {
            return 0;
        }

        let total = 0;
        const phases = this.getPhases();
        const normalizedItemName = itemName.toLowerCase().trim();

        for (const phase of phases) {
            if (phase.id <= currentPhase) continue;
            if (!phase.requirements) continue;

            const req = phase.requirements.find(r =>
                r.item.toLowerCase().trim() === normalizedItemName
            );

            if (req) {
                total += req.amount;
            }
        }

        return total;
    }
}
