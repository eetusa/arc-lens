import { useState, useEffect, useCallback } from 'react';

/**
 * App mode types
 * - 'game': For the PC running Arc Raiders (has capture, status bar, full UI)
 * - 'companion': For phones/tablets viewing results (simplified UI, no capture)
 */
export const AppMode = {
  GAME: 'game',
  COMPANION: 'companion'
};

const STORAGE_KEY = 'arcLens_appMode';

/**
 * Detects if the device has touch capability
 * Uses multiple detection methods for reliability
 */
function detectTouchDevice() {
  // Check for touch points (most reliable)
  if (navigator.maxTouchPoints > 0) {
    return true;
  }

  // Check for touch events support
  if ('ontouchstart' in window) {
    return true;
  }

  // Check CSS media query for coarse pointer (touch)
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    return true;
  }

  // Check CSS media query for no hover capability (touch devices can't hover)
  if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
    return true;
  }

  return false;
}

/**
 * Hook to manage app mode (Game vs Companion)
 *
 * - Touch devices: Always Companion mode (can't run the game)
 * - Non-touch devices: Default to Game mode, can toggle to Companion
 *
 * @returns {Object} { mode, isTouchDevice, canToggle, toggleMode, isCompanionMode, isGameMode }
 */
export function useAppMode() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [mode, setMode] = useState(AppMode.GAME);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initial detection
  useEffect(() => {
    const touchDetected = detectTouchDevice();
    setIsTouchDevice(touchDetected);

    if (touchDetected) {
      // Touch devices are always Companion mode
      setMode(AppMode.COMPANION);
    } else {
      // Non-touch: Check localStorage for saved preference
      const savedMode = localStorage.getItem(STORAGE_KEY);
      if (savedMode === AppMode.COMPANION || savedMode === AppMode.GAME) {
        setMode(savedMode);
      } else {
        // Default to Game mode for desktops
        setMode(AppMode.GAME);
      }
    }

    setIsInitialized(true);
  }, []);

  // Toggle mode (only works for non-touch devices)
  const toggleMode = useCallback(() => {
    if (isTouchDevice) {
      // Touch devices can't toggle
      return;
    }

    setMode(currentMode => {
      const newMode = currentMode === AppMode.GAME ? AppMode.COMPANION : AppMode.GAME;
      localStorage.setItem(STORAGE_KEY, newMode);
      return newMode;
    });
  }, [isTouchDevice]);

  // Set specific mode (only works for non-touch devices)
  const setAppMode = useCallback((newMode) => {
    if (isTouchDevice) {
      return;
    }

    if (newMode === AppMode.GAME || newMode === AppMode.COMPANION) {
      setMode(newMode);
      localStorage.setItem(STORAGE_KEY, newMode);
    }
  }, [isTouchDevice]);

  return {
    mode,
    isTouchDevice,
    canToggle: !isTouchDevice,
    toggleMode,
    setAppMode,
    isCompanionMode: mode === AppMode.COMPANION,
    isGameMode: mode === AppMode.GAME,
    isInitialized
  };
}
