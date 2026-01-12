import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user is on a mobile device
 * @param {number} breakpoint - Max width in pixels to consider mobile (default: 768)
 * @returns {boolean} - True if viewport width is below breakpoint
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    window.addEventListener('resize', handleResize);

    // Initial check
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}
