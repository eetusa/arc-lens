/**
 * ProjectTracker - Tracks project phases and item requirements
 *
 * Loads project data from projects.json and provides methods to check
 * if items are needed for upcoming phases. Supports multiple projects dynamically.
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
            console.log("ProjectTracker: Loaded", this.projectData.projects?.length || 0, "projects");
        } catch (e) {
            console.error("ProjectTracker: Failed to load projects.json", e);
        }
    }

    /**
     * Get all projects
     * @returns {Array} Array of project objects
     */
    getProjects() {
        return this.projectData?.projects || [];
    }

    /**
     * Get a specific project by ID
     * @param {string} projectId - Project ID
     * @returns {Object|null} Project data
     */
    getProject(projectId) {
        return this.getProjects().find(p => p.id === projectId) || null;
    }

    /**
     * Get phases for a specific project
     * @param {string} projectId - Project ID
     * @returns {Array} Array of phase objects
     */
    getPhases(projectId) {
        const project = this.getProject(projectId);
        return project?.phases || [];
    }

    /**
     * Check if an item is needed in any project's current or future phases
     * Returns ALL matches across all projects (not just the first)
     * @param {string} itemName - Item name to check
     * @param {Object} projectPhases - Map of projectId -> phase currently working on (1 = first phase, >maxPhase = done)
     * @returns {Object} { needed: boolean, matches: Array<{project, projectId, phase, phaseId, amount}> }
     */
    isItemNeeded(itemName, projectPhases = {}) {
        if (!this.isLoaded) {
            return { needed: false, matches: [] };
        }

        const normalizedItemName = itemName.toLowerCase().trim();
        const matches = [];

        for (const project of this.getProjects()) {
            // Default to phase 1 (working on first phase) if not set
            const workingOnPhase = projectPhases[project.id] || 1;

            for (const phase of project.phases || []) {
                // Skip phases before the one we're working on
                if (phase.id < workingOnPhase) continue;

                // Skip phases without item requirements
                if (!phase.requirements || phase.requirements.length === 0) continue;

                const req = phase.requirements.find(r =>
                    r.item.toLowerCase().trim() === normalizedItemName
                );

                if (req) {
                    matches.push({
                        project: project.name,
                        projectId: project.id,
                        phase: phase.name,
                        phaseId: phase.id,
                        amount: req.amount
                    });
                }
            }
        }

        return { needed: matches.length > 0, matches };
    }

    /**
     * Get all items needed across all projects' current and future phases
     * @param {Object} projectPhases - Map of projectId -> phase currently working on
     * @returns {Array} Array of { itemName, project, projectId, phase, phaseId, amount }
     */
    getAllNeededItems(projectPhases = {}) {
        if (!this.isLoaded) {
            return [];
        }

        const neededItems = [];

        for (const project of this.getProjects()) {
            const workingOnPhase = projectPhases[project.id] || 1;

            for (const phase of project.phases || []) {
                if (phase.id < workingOnPhase) continue;
                if (!phase.requirements) continue;

                for (const req of phase.requirements) {
                    neededItems.push({
                        itemName: req.item,
                        project: project.name,
                        projectId: project.id,
                        phase: phase.name,
                        phaseId: phase.id,
                        amount: req.amount
                    });
                }
            }
        }

        return neededItems;
    }

    /**
     * Get total amount of a specific item needed across current and future phases
     * @param {string} itemName - Item name to check
     * @param {Object} projectPhases - Map of projectId -> phase currently working on
     * @returns {number} Total amount needed
     */
    getTotalAmountNeeded(itemName, projectPhases = {}) {
        if (!this.isLoaded) {
            return 0;
        }

        let total = 0;
        const normalizedItemName = itemName.toLowerCase().trim();

        for (const project of this.getProjects()) {
            const workingOnPhase = projectPhases[project.id] || 1;

            for (const phase of project.phases || []) {
                if (phase.id < workingOnPhase) continue;
                if (!phase.requirements) continue;

                const req = phase.requirements.find(r =>
                    r.item.toLowerCase().trim() === normalizedItemName
                );

                if (req) {
                    total += req.amount;
                }
            }
        }

        return total;
    }
}
