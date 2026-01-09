export class ItemDatabase {
    constructor() {
        this.items = {}; // Map<id, ItemNode>
        this.isLoaded = false;
    }

    async load() {
        try {
            // We assume a single aggregated file for web performance
            const response = await fetch('/items_db.json');
            const data = await response.json();
            
            // If data is array of items
            if (Array.isArray(data)) {
                data.forEach(item => this._processItem(item));
            } else {
                // If dictionary
                Object.values(data).forEach(item => this._processItem(item));
            }

            this._buildGraph();
            this.isLoaded = true;
            console.log(`ItemDatabase: Loaded ${Object.keys(this.items).length} items`);
        } catch (e) {
            console.error("ItemDatabase: Failed to load items_db.json", e);
        }
    }

    _processItem(data) {
        if (!data.id) return;
        this.items[data.id] = {
            id: data.id,
            name: data.name || 'Unknown',
            type: data.type || 'misc',
            // --- CHANGE: Capture Rarity ---
            rarity: data.rarity || 'common', 
            // ------------------------------
            value: data.value ?? 0,
            raw: data,
            yieldsFromRecycle: {},
            craftsInto: []
        };
    }

    _buildGraph() {
        for (const item of Object.values(this.items)) {
            // 1. Recycle Links (Forward)
            const breaksInto = item.raw.breaksInto || [];
            breaksInto.forEach(entry => {
                const targetId = entry.item?.id;
                const amount = entry.amount || 1;
                if (targetId) {
                    item.yieldsFromRecycle[targetId] = amount;
                }
            });

            // 2. Crafting Links (Reverse)
            const reqItems = item.raw.craftingRequirement?.requiredItems || [];
            reqItems.forEach(entry => {
                const ingredientId = entry.item?.id;
                if (ingredientId && this.items[ingredientId]) {
                    this.items[ingredientId].craftsInto.push(item.id);
                }
            });
        }
    }

    getItem(idOrName) {
        // Direct ID check
        if (this.items[idOrName]) return this.items[idOrName];

        // Case-insensitive Name check (slower, but necessary for OCR)
        const lower = idOrName.toLowerCase();
        return Object.values(this.items).find(i => i.name.toLowerCase() === lower);
    }

    getRecycleValue(itemId) {
        const item = this.items[itemId];
        if (!item) return 0;

        let total = 0;
        for (const [compId, amount] of Object.entries(item.yieldsFromRecycle)) {
            const compNode = this.items[compId];
            if (compNode) {
                total += (compNode.value * amount);
            }
        }
        return total;
    }
}