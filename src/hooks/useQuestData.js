import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for loading and managing quest map data
 *
 * Loads:
 * - maps.json: Map configurations with calibrated transforms
 * - metaforge_quests.json: Quest markers with coordinates
 * - quests_detailed.json: Quest objectives, rewards, etc.
 *
 * Returns:
 * - mapsConfig: Map configurations by ID
 * - questMarkers: Quest markers grouped by map
 * - isLoading: Whether data is still loading
 * - getMarkersForQuest: Get markers for a specific quest name
 * - getMapsForQuest: Get all maps that have markers for a quest
 * - getQuestDetails: Get detailed quest info (objectives, rewards)
 */
export default function useQuestData() {
  const [mapsConfig, setMapsConfig] = useState(null);
  const [metaforgeData, setMetaforgeData] = useState(null);
  const [questsDetailed, setQuestsDetailed] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [mapsRes, metaforgeRes, questsRes] = await Promise.all([
          fetch('/maps.json'),
          fetch('/metaforge_quests.json'),
          fetch('/quests_detailed.json')
        ]);

        if (mapsRes.ok) {
          const mapsData = await mapsRes.json();
          setMapsConfig(mapsData.maps || {});
        }

        if (metaforgeRes.ok) {
          const metaforge = await metaforgeRes.json();
          setMetaforgeData(metaforge);
        }

        if (questsRes.ok) {
          const quests = await questsRes.json();
          setQuestsDetailed(quests.quests || {});
        }
      } catch (err) {
        console.error('Failed to load quest data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * Get all markers for a specific quest (by name or partial match)
   * Returns markers with pixel coordinates added
   */
  const getMarkersForQuest = useCallback((questName) => {
    if (!metaforgeData?.questMarkers || !mapsConfig) return [];

    const normalizedSearch = questName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const results = [];
    const seenIds = new Set(); // Track IDs to ensure uniqueness

    for (const [mapId, markers] of Object.entries(metaforgeData.questMarkers)) {
      const mapConfig = mapsConfig[mapId];
      if (!mapConfig?.transform) continue;

      for (const marker of markers) {
        const subcategory = (marker.subcategory || '').toLowerCase();
        const instanceName = (marker.instanceName || '').toLowerCase();

        // Match by quest name
        if (subcategory.includes(normalizedSearch) ||
            instanceName.includes(questName.toLowerCase()) ||
            subcategory === normalizedSearch) {
          // Generate unique ID: prefer original marker.id, fallback to coords with suffix if needed
          let id = marker.id || `${mapId}-${marker.lat}-${marker.lng}`;

          // Ensure uniqueness - append suffix if ID already seen
          let uniqueId = id;
          let suffix = 1;
          while (seenIds.has(uniqueId)) {
            uniqueId = `${id}-${suffix}`;
            suffix++;
          }
          seenIds.add(uniqueId);

          results.push({
            id: uniqueId,
            mapId,
            lat: marker.lat,
            lng: marker.lng,
            type: inferMarkerType(marker),
            label: marker.instanceName || marker.subcategory,
            raw: marker
          });
        }
      }
    }

    return results;
  }, [metaforgeData, mapsConfig]);

  /**
   * Get all maps that have markers for a specific quest
   */
  const getMapsForQuest = useCallback((questName) => {
    const markers = getMarkersForQuest(questName);
    const mapIds = [...new Set(markers.map(m => m.mapId))];

    return mapIds.map(id => ({
      id,
      name: mapsConfig[id]?.name || id
    }));
  }, [getMarkersForQuest, mapsConfig]);

  /**
   * Get map configuration by ID
   */
  const getMapConfig = useCallback((mapId) => {
    return mapsConfig?.[mapId] || null;
  }, [mapsConfig]);

  /**
   * Get all quest markers for a specific map
   */
  const getMapMarkers = useCallback((mapId) => {
    if (!metaforgeData?.questMarkers?.[mapId]) return [];

    const seenIds = new Set();
    return metaforgeData.questMarkers[mapId].map(marker => {
      // Generate unique ID: prefer original marker.id, fallback to coords with suffix if needed
      let id = marker.id || `${mapId}-${marker.lat}-${marker.lng}`;

      // Ensure uniqueness - append suffix if ID already seen
      let uniqueId = id;
      let suffix = 1;
      while (seenIds.has(uniqueId)) {
        uniqueId = `${id}-${suffix}`;
        suffix++;
      }
      seenIds.add(uniqueId);

      return {
        id: uniqueId,
        mapId,
        lat: marker.lat,
        lng: marker.lng,
        type: inferMarkerType(marker),
        label: marker.instanceName || marker.subcategory,
        raw: marker
      };
    });
  }, [metaforgeData]);

  /**
   * Get detailed quest info by name (objectives, rewards, etc.)
   */
  const getQuestDetails = useCallback((questName) => {
    if (!questsDetailed) return null;

    // Generate quest ID from name (same logic as scraper)
    const questId = questName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    return questsDetailed[questId] || null;
  }, [questsDetailed]);

  return {
    mapsConfig,
    isLoading,
    getMarkersForQuest,
    getMapsForQuest,
    getMapConfig,
    getMapMarkers,
    getQuestDetails
  };
}

/**
 * Infer marker type from marker data
 */
function inferMarkerType(marker) {
  const name = (marker.instanceName || marker.subcategory || '').toLowerCase();

  if (name.includes('photograph') || name.includes('photo')) return 'photograph';
  if (name.includes('deliver') || name.includes('return')) return 'deliver';
  if (name.includes('find') || name.includes('locate') || name.includes('search')) return 'locate';
  if (name.includes('interact') || name.includes('use') || name.includes('activate')) return 'interact';
  if (name.includes('kill') || name.includes('defeat') || name.includes('destroy')) return 'kill';

  return 'default';
}
