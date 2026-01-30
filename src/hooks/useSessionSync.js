import { useEffect, useRef, useCallback, useState } from 'react';
import { SessionClient } from '../utils/sessionClient';

export function useSessionSync({
  // State to sync
  stationLevels,
  activeQuests,
  userPriorities,
  devPrioritiesEnabled,
  userPrioritiesEnabled,
  projectProgress,
  currentAnalysis,
  manualAnalysis,
  isInventoryOpen,
  isStreaming,
  isAnalyzing,

  // Setters for incoming sync
  setStationLevels,
  setActiveQuests,
  setUserPriorities,
  setDevPrioritiesEnabled,
  setUserPrioritiesEnabled,
  setProjectProgress,
  setManualAnalysis,

  // Session config
  sessionId,
  isHost,
  isEnabled,

  // Callbacks
  onSessionEnded
}) {
  const clientRef = useRef(null);
  const lastSyncTimestamp = useRef(0);
  const [viewerCount, setViewerCount] = useState(0);

  // Initialize client and set up listeners BEFORE connecting
  useEffect(() => {
    if (!isEnabled || !sessionId) return;

    const client = new SessionClient();
    clientRef.current = client;

    // Set up all listeners BEFORE connecting
    const handleConnectionStatusUpdate = (payload) => {
      if (payload.viewerCount !== undefined) {
        setViewerCount(payload.viewerCount);
      }
    };
    client.on('CONNECTION_STATUS_UPDATE', handleConnectionStatusUpdate);

    // Handle session ended (host disconnected)
    const handleSessionEnded = (payload) => {
      if (onSessionEnded) {
        onSessionEnded(payload.reason);
      }
      // Disconnect client
      client.disconnect();
    };
    client.on('SESSION_ENDED', handleSessionEnded);

    // Now connect
    client.connect(sessionId);

    return () => {
      client.off('CONNECTION_STATUS_UPDATE', handleConnectionStatusUpdate);
      client.off('SESSION_ENDED', handleSessionEnded);
      client.disconnect();
    };
  }, [isEnabled, sessionId, onSessionEnded]);

  // Host: Create session
  useEffect(() => {
    if (!isEnabled || !isHost || !sessionId) return;

    const client = clientRef.current;
    if (!client?.isConnected) {
      // Wait for connection
      const handleConnected = () => {
        client.createSession(sessionId);
      };
      client.on('connected', handleConnected);
      return () => client.off('connected', handleConnected);
    }

    client.createSession(sessionId);
  }, [isEnabled, isHost, sessionId]);

  // Viewer: Join session
  useEffect(() => {
    if (!isEnabled || isHost || !sessionId) return;

    const client = clientRef.current;
    if (!client?.isConnected) {
      // Wait for connection
      const handleConnected = () => {
        client.joinSession(sessionId);
      };
      client.on('connected', handleConnected);
      return () => client.off('connected', handleConnected);
    }

    client.joinSession(sessionId);
  }, [isEnabled, isHost, sessionId]);

  // Host: Send initial state when viewer requests it
  useEffect(() => {
    if (!isEnabled || !isHost) return;

    const client = clientRef.current;
    if (!client) return;

    const handleInitialStateRequest = () => {
      client.sendMessage('SYNC_INITIAL', {
        stationLevels,
        activeQuests,
        userPriorities,
        devPrioritiesEnabled,
        userPrioritiesEnabled,
        projectProgress,
        currentAnalysis,
        manualAnalysis
      });
    };

    client.on('REQUEST_INITIAL_STATE', handleInitialStateRequest);

    return () => {
      client.off('REQUEST_INITIAL_STATE', handleInitialStateRequest);
    };
  }, [
    isEnabled,
    isHost,
    stationLevels,
    activeQuests,
    userPriorities,
    devPrioritiesEnabled,
    userPrioritiesEnabled,
    projectProgress,
    currentAnalysis,
    manualAnalysis
  ]);

  // Viewer: Receive initial state
  useEffect(() => {
    if (!isEnabled || isHost) return;

    const client = clientRef.current;
    if (!client) return;

    const handleInitialState = (payload) => {
      if (payload.stationLevels) setStationLevels(payload.stationLevels);
      if (payload.activeQuests) setActiveQuests(payload.activeQuests);
      if (payload.userPriorities) setUserPriorities(payload.userPriorities);
      if (payload.devPrioritiesEnabled !== undefined)
        setDevPrioritiesEnabled(payload.devPrioritiesEnabled);
      if (payload.userPrioritiesEnabled !== undefined)
        setUserPrioritiesEnabled(payload.userPrioritiesEnabled);
      if (payload.projectProgress) setProjectProgress(payload.projectProgress);
    };

    client.on('SYNC_INITIAL', handleInitialState);

    return () => {
      client.off('SYNC_INITIAL', handleInitialState);
    };
  }, [
    isEnabled,
    isHost,
    setStationLevels,
    setActiveQuests,
    setUserPriorities,
    setDevPrioritiesEnabled,
    setUserPrioritiesEnabled,
    setProjectProgress
  ]);

  // Host: Send analysis updates (debounced)
  useEffect(() => {
    if (!isEnabled || !isHost) return;

    const client = clientRef.current;
    if (!client?.isConnected) return;

    // Debounce: Don't send if last sync was < 100ms ago
    const now = Date.now();
    if (now - lastSyncTimestamp.current < 100) return;
    lastSyncTimestamp.current = now;

    client.sendMessage('SYNC_ANALYSIS', {
      currentAnalysis,
      manualAnalysis,
      timestamp: now
    });
  }, [isEnabled, isHost, currentAnalysis, manualAnalysis]);

  // Viewer: Receive analysis updates
  useEffect(() => {
    if (!isEnabled || isHost) return;

    const client = clientRef.current;
    if (!client) return;

    const handleAnalysisUpdate = (payload) => {
      // Update manual analysis on mobile with received data
      if (payload.currentAnalysis || payload.manualAnalysis) {
        setManualAnalysis(payload.currentAnalysis || payload.manualAnalysis);
      }
    };

    client.on('SYNC_ANALYSIS', handleAnalysisUpdate);

    return () => {
      client.off('SYNC_ANALYSIS', handleAnalysisUpdate);
    };
  }, [isEnabled, isHost, setManualAnalysis]);

  // Host: Send inventory state
  useEffect(() => {
    if (!isEnabled || !isHost) return;

    const client = clientRef.current;
    if (!client?.isConnected) return;

    client.sendMessage('SYNC_INVENTORY_STATE', {
      isInventoryOpen,
      isStreaming,
      isAnalyzing
    });
  }, [isEnabled, isHost, isInventoryOpen, isStreaming, isAnalyzing]);

  // Bidirectional: Settings sync callback
  const syncSettings = useCallback(
    (changes) => {
      if (!isEnabled) return;

      const client = clientRef.current;
      if (!client?.isConnected) return;

      client.sendMessage('SYNC_SETTINGS', {
        ...changes,
        timestamp: Date.now()
      });
    },
    [isEnabled]
  );

  // Receive settings from other device
  useEffect(() => {
    if (!isEnabled) return;

    const client = clientRef.current;
    if (!client) return;

    const handleSettingsUpdate = (payload) => {
      if (payload.stationLevels) setStationLevels(payload.stationLevels);
      if (payload.activeQuests) setActiveQuests(payload.activeQuests);
      if (payload.userPriorities) setUserPriorities(payload.userPriorities);
      if (payload.devPrioritiesEnabled !== undefined)
        setDevPrioritiesEnabled(payload.devPrioritiesEnabled);
      if (payload.userPrioritiesEnabled !== undefined)
        setUserPrioritiesEnabled(payload.userPrioritiesEnabled);
      if (payload.projectProgress) setProjectProgress(payload.projectProgress);
    };

    client.on('SYNC_SETTINGS', handleSettingsUpdate);

    return () => {
      client.off('SYNC_SETTINGS', handleSettingsUpdate);
    };
  }, [
    isEnabled,
    setStationLevels,
    setActiveQuests,
    setUserPriorities,
    setDevPrioritiesEnabled,
    setUserPrioritiesEnabled,
    setProjectProgress
  ]);

  return {
    isConnected: clientRef.current?.isConnected || false,
    sessionClient: clientRef.current,
    syncSettings,
    viewerCount
  };
}
