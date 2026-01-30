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

  // --- Project Progress (granular per-item tracking) ---
  // State structure: { projectId: { viewing: number, completed: { "phaseId:itemName": true } } }
  const [projectProgress, setProjectProgress] = useState(() => {
    try {
      const saved = localStorage.getItem("app_projectProgress");
      if (saved) {
        return JSON.parse(saved);
      }

      // Migration from old projectPhases format
      const oldPhases = localStorage.getItem("app_projectPhases");
      if (oldPhases) {
        const parsed = JSON.parse(oldPhases);
        // Convert old "working on phase N" to new format with viewing but no completions
        const migrated = {};
        for (const [projectId, phase] of Object.entries(parsed)) {
          migrated[projectId] = {
            viewing: phase === 0 ? 1 : phase,
            completed: {}
          };
        }
        return migrated;
      }

      // Migration from very old single projectPhase value
      const oldPhase = localStorage.getItem("app_projectPhase");
      if (oldPhase !== null) {
        const oldVal = JSON.parse(oldPhase);
        return {
          "expedition-2": {
            viewing: oldVal === 0 ? 1 : oldVal + 1,
            completed: {}
          }
        };
      }

      return {};
    } catch (e) {
      return {};
    }
  });

  // Helper to get the old-style projectPhases for backwards compatibility with advisor engine
  const projectPhases = Object.fromEntries(
    Object.entries(projectProgress).map(([projectId, progress]) => {
      // Calculate effective phase based on completion
      // This is a simplified version - the real logic is in ProjectPanel
      return [projectId, progress.viewing || 1];
    })
  );

  // --- Quest Auto-Detect ---
  const [questAutoDetect, setQuestAutoDetect] = useState(() => {
    try {
      const saved = localStorage.getItem("app_questAutoDetect");
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  // --- Quest Helper Enabled ---
  const [questHelperEnabled, setQuestHelperEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("app_questHelperEnabled");
      return saved !== null ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  // --- Config Panel Open (Desktop) ---
  const [configPanelOpen, setConfigPanelOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("app_configPanelOpen");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  // --- Advisor Panel Open (Desktop) ---
  const [advisorPanelOpen, setAdvisorPanelOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("app_advisorPanelOpen");
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  // --- Panel Widths (Desktop) ---
  const [panelWidths, setPanelWidths] = useState(() => {
    try {
      const saved = localStorage.getItem("app_panelWidths");
      return saved ? JSON.parse(saved) : {
        config: 280,
        quest: 360
      };
    } catch (e) {
      return { config: 280, quest: 360 };
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

  useEffect(() => {
    localStorage.setItem("app_projectProgress", JSON.stringify(projectProgress));
  }, [projectProgress]);

  useEffect(() => {
    localStorage.setItem("app_questAutoDetect", JSON.stringify(questAutoDetect));
  }, [questAutoDetect]);

  useEffect(() => {
    localStorage.setItem("app_questHelperEnabled", JSON.stringify(questHelperEnabled));
  }, [questHelperEnabled]);

  useEffect(() => {
    localStorage.setItem("app_configPanelOpen", JSON.stringify(configPanelOpen));
  }, [configPanelOpen]);

  useEffect(() => {
    localStorage.setItem("app_advisorPanelOpen", JSON.stringify(advisorPanelOpen));
  }, [advisorPanelOpen]);

  useEffect(() => {
    localStorage.setItem("app_panelWidths", JSON.stringify(panelWidths));
  }, [panelWidths]);

  // Helper to update a single panel width
  const setPanelWidth = (panelId, width) => {
    setPanelWidths(prev => ({ ...prev, [panelId]: width }));
  };

  // Helper to set which phase is being viewed for a project
  const setProjectViewing = (projectId, phase) => {
    setProjectProgress(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        viewing: phase,
        completed: prev[projectId]?.completed || {}
      }
    }));
  };

  // Helper to toggle item completion
  const toggleProjectItemCompletion = (projectId, itemKey) => {
    setProjectProgress(prev => {
      const current = prev[projectId] || { viewing: 1, completed: {} };
      const newCompleted = { ...current.completed };
      if (newCompleted[itemKey]) {
        delete newCompleted[itemKey];
      } else {
        newCompleted[itemKey] = true;
      }
      return {
        ...prev,
        [projectId]: {
          ...current,
          completed: newCompleted
        }
      };
    });
  };

  // Helper to mark entire project as done (set viewing to maxPhase + 1)
  const setProjectDone = (projectId, maxPhase) => {
    setProjectProgress(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        viewing: maxPhase + 1,
        completed: prev[projectId]?.completed || {}
      }
    }));
  };

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
    setUserPrioritiesEnabled,
    // Legacy projectPhases for backward compatibility with advisor engine
    projectPhases,
    // New granular project progress
    projectProgress,
    setProjectProgress,
    setProjectViewing,
    toggleProjectItemCompletion,
    setProjectDone,
    questAutoDetect,
    setQuestAutoDetect,
    questHelperEnabled,
    setQuestHelperEnabled,
    configPanelOpen,
    setConfigPanelOpen,
    advisorPanelOpen,
    setAdvisorPanelOpen,
    panelWidths,
    setPanelWidth
  };
};