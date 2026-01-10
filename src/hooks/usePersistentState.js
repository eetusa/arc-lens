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

  // --- User Priorities ---
  const [userPriorities, setUserPriorities] = useState(() => {
    try {
      const saved = localStorage.getItem("app_userPriorities");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse user priorities", e);
      return [];
    }
  });

  // --- Developer Priorities Enabled ---
  const [devPrioritiesEnabled, setDevPrioritiesEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("app_devPrioritiesEnabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  // --- User Priorities Enabled ---
  const [userPrioritiesEnabled, setUserPrioritiesEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("app_userPrioritiesEnabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  // --- Effects to save on change ---
  useEffect(() => {
    localStorage.setItem("app_stationLevels", JSON.stringify(stationLevels));
  }, [stationLevels]);

  useEffect(() => {
    localStorage.setItem("app_activeQuests", JSON.stringify(activeQuests));
  }, [activeQuests]);

  useEffect(() => {
    localStorage.setItem("app_userPriorities", JSON.stringify(userPriorities));
  }, [userPriorities]);

  useEffect(() => {
    localStorage.setItem("app_devPrioritiesEnabled", JSON.stringify(devPrioritiesEnabled));
  }, [devPrioritiesEnabled]);

  useEffect(() => {
    localStorage.setItem("app_userPrioritiesEnabled", JSON.stringify(userPrioritiesEnabled));
  }, [userPrioritiesEnabled]);

  return {
    stationLevels,
    setStationLevels,
    activeQuests,
    setActiveQuests,
    userPriorities,
    setUserPriorities,
    devPrioritiesEnabled,
    setDevPrioritiesEnabled,
    userPrioritiesEnabled,
    setUserPrioritiesEnabled
  };
};