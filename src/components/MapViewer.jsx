import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { theme } from '../styles';
import { coordsToPixels } from '../utils/mapCoords';

/**
 * MapViewer - Interactive map component with pan/zoom and marker rendering
 *
 * Props:
 * - mapConfig: Map configuration from maps.json (id, image, dimensions, transform)
 * - markers: Array of markers to display [{lat, lng, type, label}]
 * - selectedMarkerId: Currently selected marker ID
 * - onMarkerClick: Callback when marker is clicked
 * - focusMarkerId: When set, pan/zoom to this marker
 *
 * Ref methods:
 * - focusMarker(markerId): Pan/zoom to a specific marker
 * - resetView(): Reset to default centered view
 */
const MapViewer = forwardRef(function MapViewer({
  mapConfig,
  markers = [],
  selectedMarkerId = null,
  onMarkerClick = () => {},
  focusMarkerId = null
}, ref) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [containerNode, setContainerNode] = useState(null);
  const [mapImage, setMapImage] = useState(null);
  const [altMapImage, setAltMapImage] = useState(null); // The other level's image for blending
  const [viewState, setViewState] = useState({
    zoom: 0.1,
    panX: 0,
    panY: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [showLower, setShowLower] = useState(false);

  // Reset lower toggle when map changes
  useEffect(() => {
    setShowLower(false);
  }, [mapConfig?.id]);

  // Get the active transform (use lowerTransform when showing lower level)
  const activeTransform = showLower && mapConfig?.lowerTransform
    ? mapConfig.lowerTransform
    : mapConfig?.transform;

  // Callback ref to capture container node
  const containerRef = useCallback((node) => {
    if (node) {
      setContainerNode(node);
    }
  }, []);

  // Track previous state for level toggle handling
  const prevMapIdRef = useRef(mapConfig?.id);
  const prevShowLowerRef = useRef(showLower);
  const viewStateRef = useRef(viewState);
  const containerSizeRef = useRef(containerSize);

  // Keep refs in sync
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);
  useEffect(() => {
    containerSizeRef.current = containerSize;
  }, [containerSize]);

  // Animate view to target position
  const animateToView = useCallback((targetView, duration = 300) => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = performance.now();
    const startView = { ...viewStateRef.current };

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      setViewState({
        zoom: startView.zoom + (targetView.zoom - startView.zoom) * eased,
        panX: startView.panX + (targetView.panX - startView.panX) * eased,
        panY: startView.panY + (targetView.panY - startView.panY) * eased
      });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Load map image (or lower variant)
  useEffect(() => {
    const imageSrc = showLower && mapConfig?.lowerImage ? mapConfig.lowerImage : mapConfig?.image;
    if (!imageSrc) return;

    const isMapChange = prevMapIdRef.current !== mapConfig?.id;
    const isLevelToggle = !isMapChange && prevShowLowerRef.current !== showLower;

    // Get the old and new transforms
    const oldTransform = prevShowLowerRef.current && mapConfig?.lowerTransform
      ? mapConfig.lowerTransform
      : mapConfig?.transform;
    const newTransform = showLower && mapConfig?.lowerTransform
      ? mapConfig.lowerTransform
      : mapConfig?.transform;

    // Calculate pending center coords BEFORE updating refs
    let pendingCenterCoords = null;
    if (isLevelToggle && oldTransform && newTransform && containerSizeRef.current.width > 0) {
      const { zoom, panX, panY } = viewStateRef.current;
      const cSize = containerSizeRef.current;
      // Calculate the pixel position at the center of the view (on the image)
      const imageCenterX = (cSize.width / 2 - panX) / zoom;
      const imageCenterY = (cSize.height / 2 - panY) / zoom;
      // Convert to game coordinates using the OLD transform
      const lng = (imageCenterX - oldTransform.offsetX) / oldTransform.scaleX;
      const lat = (imageCenterY - oldTransform.offsetY) / oldTransform.scaleY;
      pendingCenterCoords = { lat, lng, zoom, newTransform };
    }

    prevMapIdRef.current = mapConfig?.id;
    prevShowLowerRef.current = showLower;

    // Clear old image before loading new one
    setMapImage(null);

    // Only reset view state when actual map changes, not when toggling levels
    if (isMapChange) {
      setIsInitialized(false);
      setAltMapImage(null);
    }

    const img = new Image();
    img.onload = () => {
      setMapImage(img);

      // If we have pending center coords from a level toggle, restore the view
      if (pendingCenterCoords) {
        const { lat, lng, zoom, newTransform: transform } = pendingCenterCoords;
        const cSize = containerSizeRef.current;
        // Convert game coords to pixel position using NEW transform
        const newImageX = lng * transform.scaleX + transform.offsetX;
        const newImageY = lat * transform.scaleY + transform.offsetY;
        // Calculate pan to center on this position
        const newPanX = cSize.width / 2 - newImageX * zoom;
        const newPanY = cSize.height / 2 - newImageY * zoom;
        setViewState({ zoom, panX: newPanX, panY: newPanY });
      }
    };
    img.onerror = () => {
      console.error('Failed to load map image:', imageSrc);
    };
    img.src = imageSrc;
  }, [mapConfig?.id, mapConfig?.image, mapConfig?.lowerImage, mapConfig?.lowerTransform, mapConfig?.transform, showLower]);

  // Preload the alternate level image for blending
  useEffect(() => {
    if (!mapConfig?.lowerImage || !mapConfig?.image) {
      setAltMapImage(null);
      return;
    }

    // Load the opposite level's image
    const altSrc = showLower ? mapConfig.image : mapConfig.lowerImage;
    const img = new Image();
    img.onload = () => setAltMapImage(img);
    img.src = altSrc;
  }, [mapConfig?.id, mapConfig?.image, mapConfig?.lowerImage, showLower]);

  // Track container size
  useEffect(() => {
    if (!containerNode) return;

    const updateSize = () => {
      const rect = containerNode.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        });
      }
    };

    updateSize();
    const timer = setTimeout(updateSize, 100);

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerNode);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [containerNode]);

  // Calculate default view - fit to cover (no empty space), center on markers (clamped to map edges)
  const calculateDefaultView = useCallback(() => {
    if (!mapImage || containerSize.width === 0 || containerSize.height === 0) return null;

    const imgWidth = mapImage.width;
    const imgHeight = mapImage.height;

    // Use "cover" fit - choose the larger zoom so map fills container with no empty space
    const zoomToFitWidth = containerSize.width / imgWidth;
    const zoomToFitHeight = containerSize.height / imgHeight;
    const zoom = Math.max(zoomToFitWidth, zoomToFitHeight);

    // Calculate pan limits (so map edges don't go past container edges)
    const minPanX = containerSize.width - imgWidth * zoom;
    const maxPanX = 0;
    const minPanY = containerSize.height - imgHeight * zoom;
    const maxPanY = 0;

    let panX, panY;

    // If we have markers, center on their centroid
    if (markers.length > 0 && activeTransform) {
      // Calculate centroid of all markers in pixel coordinates
      let sumX = 0, sumY = 0;
      for (const marker of markers) {
        const pixel = coordsToPixels(marker.lat, marker.lng, activeTransform);
        sumX += pixel.x;
        sumY += pixel.y;
      }
      const centroidX = sumX / markers.length;
      const centroidY = sumY / markers.length;

      // Pan to center the centroid in the view
      panX = containerSize.width / 2 - centroidX * zoom;
      panY = containerSize.height / 2 - centroidY * zoom;

      // Clamp to map edges (no black areas)
      panX = Math.min(maxPanX, Math.max(minPanX, panX));
      panY = Math.min(maxPanY, Math.max(minPanY, panY));
    } else {
      // No markers - center on middle of map
      panX = containerSize.width / 2 - (imgWidth * zoom) / 2;
      panY = containerSize.height / 2 - (imgHeight * zoom) / 2;

      // Clamp to map edges (no black areas)
      panX = Math.min(maxPanX, Math.max(minPanX, panX));
      panY = Math.min(maxPanY, Math.max(minPanY, panY));
    }

    return { zoom, panX, panY };
  }, [mapImage, containerSize, markers, activeTransform]);

  // Initialize view when map loads or container size changes
  useEffect(() => {
    if (!mapImage || containerSize.width === 0 || containerSize.height === 0) return;

    // Only auto-initialize once per map
    if (!isInitialized) {
      const defaultView = calculateDefaultView();
      if (defaultView) {
        setViewState(defaultView);
        setIsInitialized(true);
      }
    }
  }, [mapImage, containerSize, isInitialized, calculateDefaultView]);

  // Focus on marker when focusMarkerId changes
  useEffect(() => {
    if (!focusMarkerId || !activeTransform || !mapImage || containerSize.width === 0 || containerSize.height === 0) return;

    const marker = markers.find(m => m.id === focusMarkerId);
    if (!marker) return;

    const pixel = coordsToPixels(marker.lat, marker.lng, activeTransform);

    // Zoom level for focused view - moderate zoom to show context
    const targetZoom = 0.35;

    // Calculate pan limits (so map edges don't go past container edges)
    const minPanX = containerSize.width - mapImage.width * targetZoom;
    const maxPanX = 0;
    const minPanY = containerSize.height - mapImage.height * targetZoom;
    const maxPanY = 0;

    // Center on the marker, clamped to map boundaries
    let panX = containerSize.width / 2 - pixel.x * targetZoom;
    let panY = containerSize.height / 2 - pixel.y * targetZoom;
    panX = Math.min(maxPanX, Math.max(minPanX, panX));
    panY = Math.min(maxPanY, Math.max(minPanY, panY));

    animateToView({ zoom: targetZoom, panX, panY });
  }, [focusMarkerId, markers, activeTransform, mapImage, containerSize]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focusMarker: (markerId) => {
      if (!mapImage) return;
      const marker = markers.find(m => m.id === markerId);
      if (!marker || !activeTransform) return;

      const pixel = coordsToPixels(marker.lat, marker.lng, activeTransform);
      const targetZoom = 0.35;

      // Calculate pan limits (so map edges don't go past container edges)
      const minPanX = containerSize.width - mapImage.width * targetZoom;
      const maxPanX = 0;
      const minPanY = containerSize.height - mapImage.height * targetZoom;
      const maxPanY = 0;

      // Center on the marker, clamped to map boundaries
      let panX = containerSize.width / 2 - pixel.x * targetZoom;
      let panY = containerSize.height / 2 - pixel.y * targetZoom;
      panX = Math.min(maxPanX, Math.max(minPanX, panX));
      panY = Math.min(maxPanY, Math.max(minPanY, panY));

      animateToView({ zoom: targetZoom, panX, panY });
    },
    resetView: () => {
      const defaultView = calculateDefaultView();
      if (defaultView) {
        animateToView(defaultView);
      }
    }
  }), [markers, activeTransform, containerSize, calculateDefaultView, mapImage]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapImage || containerSize.width === 0 || containerSize.height === 0) return;

    // Set canvas internal dimensions to match container (prevents stretching)
    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const { zoom, panX, panY } = viewState;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw alternate level image underneath (blended) if available
    if (altMapImage && mapConfig?.lowerTransform && mapConfig?.transform) {
      const altTransform = showLower ? mapConfig.transform : mapConfig.lowerTransform;

      // Calculate scale ratio between transforms
      const scaleRatioX = altTransform.scaleX / activeTransform.scaleX;
      const scaleRatioY = altTransform.scaleY / activeTransform.scaleY;

      // Calculate offset adjustment
      // For a game coord (lat, lng): altPixel = lng * altScale + altOffset
      // We want it to align with: mainPixel = lng * mainScale + mainOffset
      // So: altPan = panX + (mainOffset - altOffset * scaleRatio) * zoom...
      // Simpler: find where origin of game coords maps to on each image
      const mainOriginX = activeTransform.offsetX;
      const mainOriginY = activeTransform.offsetY;
      const altOriginX = altTransform.offsetX;
      const altOriginY = altTransform.offsetY;

      // Alt image pan adjustment to align game coordinates
      const altPanX = panX + (mainOriginX - altOriginX * scaleRatioX) * zoom;
      const altPanY = panY + (mainOriginY - altOriginY * scaleRatioY) * zoom;
      const altZoom = zoom * Math.min(scaleRatioX, scaleRatioY);

      ctx.save();
      ctx.globalAlpha = 0.35; // Draw underneath at reduced opacity
      ctx.translate(altPanX, altPanY);
      ctx.scale(altZoom, altZoom);
      ctx.drawImage(altMapImage, 0, 0);
      ctx.restore();
    }

    // Draw main map image
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    ctx.drawImage(mapImage, 0, 0);
    ctx.restore();

    // Draw markers
    if (activeTransform) {
      for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const pixel = coordsToPixels(marker.lat, marker.lng, activeTransform);
        const screenX = pixel.x * zoom + panX;
        const screenY = pixel.y * zoom + panY;

        // Marker colors based on type
        const colors = {
          photograph: '#4CAF50',
          deliver: '#2196F3',
          locate: '#FF9800',
          interact: '#9C27B0',
          kill: '#F44336',
          default: '#0078d4'
        };
        const color = colors[marker.type] || colors.default;
        const isSelected = marker.id === selectedMarkerId;
        const radius = isSelected ? 14 : 10;

        // Draw marker circle
        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#fff' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Draw marker number
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${isSelected ? 12 : 10}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), screenX, screenY);

        // Draw label on selection
        if (isSelected && marker.label) {
          const labelY = screenY - radius - 12;
          ctx.font = 'bold 11px Arial';
          const textWidth = ctx.measureText(marker.label).width;

          // Background
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          const padding = 6;
          ctx.fillRect(screenX - textWidth/2 - padding, labelY - 10, textWidth + padding * 2, 20);

          // Border
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX - textWidth/2 - padding, labelY - 10, textWidth + padding * 2, 20);

          // Text
          ctx.fillStyle = '#fff';
          ctx.fillText(marker.label, screenX, labelY);
        }
      }
    }
  }, [mapImage, altMapImage, viewState, markers, selectedMarkerId, activeTransform, containerSize, showLower, mapConfig?.transform, mapConfig?.lowerTransform]);

  // Mouse handlers for pan
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - viewState.panX, y: e.clientY - viewState.panY });
  }, [viewState.panX, viewState.panY]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setViewState(prev => ({
      ...prev,
      panX: e.clientX - dragStart.x,
      panY: e.clientY - dragStart.y
    }));
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel handler for zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;

    setViewState(prev => {
      const newZoom = Math.max(0.05, Math.min(3, prev.zoom * zoomFactor));

      // Zoom towards mouse position
      const newPanX = mouseX - (mouseX - prev.panX) * (newZoom / prev.zoom);
      const newPanY = mouseY - (mouseY - prev.panY) * (newZoom / prev.zoom);

      return { zoom: newZoom, panX: newPanX, panY: newPanY };
    });
  }, []);

  // Click handler for markers
  const handleClick = useCallback((e) => {
    if (!activeTransform) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const { zoom, panX, panY } = viewState;

    // Check if click is on a marker
    for (const marker of markers) {
      const pixel = coordsToPixels(marker.lat, marker.lng, activeTransform);
      const screenX = pixel.x * zoom + panX;
      const screenY = pixel.y * zoom + panY;

      const distance = Math.sqrt((clickX - screenX) ** 2 + (clickY - screenY) ** 2);
      if (distance < 15) {
        onMarkerClick(marker);
        return;
      }
    }

    // Clicked on map but not on a marker - deselect
    onMarkerClick(null);
  }, [markers, viewState, activeTransform, onMarkerClick]);

  if (!mapConfig) {
    return (
      <div style={{ ...containerStyles.container, ...containerStyles.placeholder }}>
        <span style={containerStyles.placeholderText}>No map selected</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={containerStyles.container}
    >
      <canvas
        ref={canvasRef}
        style={containerStyles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      {/* Zoom controls */}
      <div style={containerStyles.controls}>
        <button
          style={containerStyles.controlButton}
          onClick={() => setViewState(prev => {
            const newZoom = Math.min(3, prev.zoom * 1.3);
            // Zoom towards center of view
            const centerX = containerSize.width / 2;
            const centerY = containerSize.height / 2;
            const newPanX = centerX - (centerX - prev.panX) * (newZoom / prev.zoom);
            const newPanY = centerY - (centerY - prev.panY) * (newZoom / prev.zoom);
            return { zoom: newZoom, panX: newPanX, panY: newPanY };
          })}
          title="Zoom in"
        >
          +
        </button>
        <button
          style={containerStyles.controlButton}
          onClick={() => setViewState(prev => {
            const newZoom = Math.max(0.05, prev.zoom / 1.3);
            // Zoom towards center of view
            const centerX = containerSize.width / 2;
            const centerY = containerSize.height / 2;
            const newPanX = centerX - (centerX - prev.panX) * (newZoom / prev.zoom);
            const newPanY = centerY - (centerY - prev.panY) * (newZoom / prev.zoom);
            return { zoom: newZoom, panX: newPanX, panY: newPanY };
          })}
          title="Zoom out"
        >
          -
        </button>
        <button
          style={containerStyles.controlButton}
          onClick={() => {
            const defaultView = calculateDefaultView();
            if (defaultView) setViewState(defaultView);
          }}
          title="Reset view"
        >
          &#8634;
        </button>
        {mapConfig?.lowerImage && (
          <button
            style={{
              ...containerStyles.controlButton,
              ...containerStyles.levelToggle,
              ...(showLower && containerStyles.levelToggleActive)
            }}
            onClick={() => setShowLower(!showLower)}
            title={showLower ? 'Show upper level' : 'Show lower level'}
          >
            {showLower ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {!mapImage && (
        <div style={containerStyles.loading}>
          <div style={containerStyles.spinner} />
          <div style={containerStyles.loadingText}>Loading map...</div>
        </div>
      )}
    </div>
  );
});

export default MapViewer;

const containerStyles = {
  container: {
    position: 'relative',
    width: '100%',
    flex: 1,
    minHeight: 0,
    backgroundColor: '#0a0a0a',
    borderRadius: '8px',
    overflow: 'hidden',
    border: `1px solid ${theme.border}`
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'grab',
    imageRendering: 'high-quality'
  },
  controls: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  controlButton: {
    width: '28px',
    height: '28px',
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: theme.border,
    borderRadius: '4px',
    color: theme.textMain,
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  levelToggle: {
    marginTop: '8px',
    fontSize: '10px'
  },
  levelToggleActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '200px'
  },
  placeholderText: {
    color: theme.textDim,
    fontSize: '12px'
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: theme.accent,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  loadingText: {
    color: theme.textDim,
    fontSize: '11px'
  }
};

// Inject spinner keyframe animation
if (typeof document !== 'undefined' && !document.getElementById('mapviewer-spinner-style')) {
  const style = document.createElement('style');
  style.id = 'mapviewer-spinner-style';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
