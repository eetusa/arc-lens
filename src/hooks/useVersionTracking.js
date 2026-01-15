import { useState, useCallback } from 'react';

const STORAGE_KEY = 'app_lastSeenVersion';

/**
 * Extracts major.minor from semver string
 * "0.9.1" -> "0.9"
 */
const getMajorMinor = (version) => {
  const parts = version.split('.');
  return `${parts[0]}.${parts[1]}`;
};

/**
 * Compares two versions, returns true if they differ in major or minor
 * (ignores patch differences)
 */
const hasSignificantUpdate = (oldVersion, newVersion) => {
  if (!oldVersion) return true; // First visit
  return getMajorMinor(oldVersion) !== getMajorMinor(newVersion);
};

export const useVersionTracking = () => {
  const currentVersion = __APP_VERSION__;

  // Lazy init from localStorage
  const [lastSeenVersion, setLastSeenVersion] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      console.error('Failed to read version from localStorage', e);
      return null;
    }
  });

  // Calculate if we should show notification
  const showVersionNotification = hasSignificantUpdate(lastSeenVersion, currentVersion);

  // Mark current version as seen
  const markVersionSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, currentVersion);
      setLastSeenVersion(currentVersion);
    } catch (e) {
      console.error('Failed to save version to localStorage', e);
    }
  }, [currentVersion]);

  return {
    currentVersion,
    lastSeenVersion,
    showVersionNotification,
    markVersionSeen
  };
};
