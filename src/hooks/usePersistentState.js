import { useState, useEffect } from 'react';
import { GET_DEFAULT_LEVELS } from '../logic/constants';

export const usePersistentState = () => {
  // --- Station Levels ---
  const [stationLevels, setStationLevels] = useState(() => {
    try {
      const saved = localStorage.getItem("app_stationLevels");
      const defaults = GET_DEFAULT_LEVELS(); 
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
      return defaults;
    } catch (e) {
      return GET_DEFAULT_LEVELS();
    }
  });

  // --- Active Quests ---
  const [activeQuests, setActiveQuests] = useState(() => {
    try {
      const saved = localStorage.getItem("app_activeQuests");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse quests", e);
      return [];
    }
  });

  // --- Effects to save on change ---
  useEffect(() => {
    localStorage.setItem("app_stationLevels", JSON.stringify(stationLevels));
  }, [stationLevels]);

  useEffect(() => {
    localStorage.setItem("app_activeQuests", JSON.stringify(activeQuests));
  }, [activeQuests]);

  return { stationLevels, setStationLevels, activeQuests, setActiveQuests };
};