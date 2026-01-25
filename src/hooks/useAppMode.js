import { useState, useEffect, useCallback, useRef } from 'react';

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

// Screen width threshold for "phone-sized" devices
// Devices with screens smaller than this are locked to Companion mode
const PHONE_MAX_WIDTH = 768;

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
 * Detects if the device has a phone-sized screen
 * Uses screen.width for the actual device screen size (not viewport)
 */
function isPhoneSizedScreen() {
  // Use screen.width to get actual device screen width
  // This is more reliable than window.innerWidth for detecting device type
  // as it doesn't change when browser is resized
  const screenWidth = window.screen?.width || window.innerWidth;
  return screenWidth < PHONE_MAX_WIDTH;
}

/**
 * Hook to manage app mode (Game vs Companion)
 *
 * Mode switching logic:
 * - Phone-sized touch devices: Locked to Companion mode (can't run the game)
 * - Large touch devices (tablets, touchscreen laptops): Default to Companion, CAN toggle
 * - Non-touch devices: Default to Game mode, can toggle to Companion
 *
 * @returns {Object} { mode, isTouchDevice, canToggle, toggleMode, isCompanionMode, isGameMode }
 */
export function useAppMode() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isPhoneSize, setIsPhoneSize] = useState(false);
  const [mode, setMode] = useState(AppMode.GAME);
  const [isInitialized, setIsInitialized] = useState(false);

  // Track previous phone size to detect changes
  const prevPhoneSizeRef = useRef(null);

  // Initial detection
  useEffect(() => {
    const touchDetected = detectTouchDevice();
    const phoneSized = isPhoneSizedScreen();

    setIsTouchDevice(touchDetected);
    setIsPhoneSize(phoneSized);
    prevPhoneSizeRef.current = phoneSized;

    // Set initial mode based on device type
    if (touchDetected && phoneSized) {
      // Phone-sized touch devices: locked to Companion mode
      setMode(AppMode.COMPANION);
    } else if (touchDetected) {
      // Large touch devices: check saved preference, default to Companion
      const savedMode = localStorage.getItem(STORAGE_KEY);
      if (savedMode === AppMode.COMPANION || savedMode === AppMode.GAME) {
        setMode(savedMode);
      } else {
        setMode(AppMode.COMPANION);
      }
    } else {
      // Non-touch: check saved preference, default to Game
      const savedMode = localStorage.getItem(STORAGE_KEY);
      if (savedMode === AppMode.COMPANION || savedMode === AppMode.GAME) {
        setMode(savedMode);
      } else {
        setMode(AppMode.GAME);
      }
    }

    setIsInitialized(true);
  }, []);

  // Listen for screen size changes (e.g., moving window to different monitor)
  useEffect(() => {
    const touchDetected = detectTouchDevice();

    const handleResize = () => {
      const phoneSized = isPhoneSizedScreen();
      const wasPhoneSize = prevPhoneSizeRef.current;

      // Only react if phone size status actually changed
      if (wasPhoneSize !== phoneSized) {
        prevPhoneSizeRef.current = phoneSized;
        setIsPhoneSize(phoneSized);

        if (!phoneSized) {
          // Moved to large screen: switch to Game mode (can game now)
          setMode(AppMode.GAME);
          localStorage.setItem(STORAGE_KEY, AppMode.GAME);
        } else if (touchDetected) {
          // Moved to phone-sized screen on touch device: lock to Companion
          setMode(AppMode.COMPANION);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Toggle mode (only blocked for phone-sized touch devices)
  const toggleMode = useCallback(() => {
    if (isTouchDevice && isPhoneSize) {
      // Phone-sized touch devices can't toggle
      return;
    }

    setMode(currentMode => {
      const newMode = currentMode === AppMode.GAME ? AppMode.COMPANION : AppMode.GAME;
      localStorage.setItem(STORAGE_KEY, newMode);
      return newMode;
    });
  }, [isTouchDevice, isPhoneSize]);

  // Set specific mode (only blocked for phone-sized touch devices)
  const setAppMode = useCallback((newMode) => {
    if (isTouchDevice && isPhoneSize) {
      return;
    }

    if (newMode === AppMode.GAME || newMode === AppMode.COMPANION) {
      setMode(newMode);
      localStorage.setItem(STORAGE_KEY, newMode);
    }
  }, [isTouchDevice, isPhoneSize]);

  // Can toggle if not a phone-sized touch device
  // Large touchscreen devices (tablets, touchscreen laptops) CAN toggle
  const canToggle = !(isTouchDevice && isPhoneSize);

  return {
    mode,
    isTouchDevice,
    canToggle,
    toggleMode,
    setAppMode,
    isCompanionMode: mode === AppMode.COMPANION,
    isGameMode: mode === AppMode.GAME,
    isInitialized
  };
}
