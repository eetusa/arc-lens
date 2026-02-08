import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { theme } from '../styles';
import { coordsToPixels } from '../utils/mapCoords';

// --- WebGL helpers for mipmap-quality map rendering ---

const MAP_VERT = `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;
uniform vec2 u_imgSize;
uniform vec2 u_offset;
uniform float u_scale;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec2 px = a_pos * u_imgSize * u_scale + u_offset;
  vec2 cp = px / u_res * 2.0 - 1.0;
  gl_Position = vec4(cp.x, -cp.y, 0.0, 1.0);
}`;

const MAP_FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
out vec4 outColor;
void main() {
  // LOD bias: selects a higher-res mip level than default,
  // preserving text readability while still using mipmaps for anti-aliasing
  vec4 c = texture(u_tex, v_uv, -1.25);
  outColor = vec4(c.rgb, c.a * u_alpha);
}`;

function initMapGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const vs = compile(gl.VERTEX_SHADER, MAP_VERT);
  const fs = compile(gl.FRAGMENT_SHADER, MAP_FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }

  // Unit quad as triangle strip
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const locs = {
    res: gl.getUniformLocation(prog, 'u_res'),
    imgSize: gl.getUniformLocation(prog, 'u_imgSize'),
    offset: gl.getUniformLocation(prog, 'u_offset'),
    scale: gl.getUniformLocation(prog, 'u_scale'),
    tex: gl.getUniformLocation(prog, 'u_tex'),
    alpha: gl.getUniformLocation(prog, 'u_alpha'),
  };

  const anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAniso = anisoExt ? gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;

  console.log('[MapViewer] WebGL2 initialized', {
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    anisotropy: maxAniso,
    renderer: gl.getParameter(gl.RENDERER)
  });

  return { gl, prog, vao, buf, locs, vs, fs, anisoExt, maxAniso, canvas };
}

// Two reusable offscreen canvases for mip generation (ping-pong)
const mipCanvases = [null, null];

function createMipmapTexture(glRes, image) {
  const { gl, anisoExt, maxAniso } = glRes;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  // Upload base level (level 0)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Generate custom mip levels using canvas 2D's Mitchell/high-quality filter
  // instead of gl.generateMipmap() which uses a blurry box filter.
  // Each level is halved from the previous using two alternating canvases.
  if (!mipCanvases[0]) {
    mipCanvases[0] = document.createElement('canvas');
    mipCanvases[1] = document.createElement('canvas');
  }

  let w = image.width;
  let h = image.height;
  let level = 0;
  let source = image;

  while (w > 1 || h > 1) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    level++;

    const target = mipCanvases[level % 2];
    target.width = w;
    target.height = h;
    const ctx = target.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);

    gl.texImage2D(gl.TEXTURE_2D, level, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, target);
    source = target;
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (anisoExt) {
    gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
  }
  return tex;
}

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

  // WebGL resources for map rendering, 2D canvas overlay for markers
  const glRef = useRef(null);
  const markerCanvasRef = useRef(null);

  // Track previous map ID for render-time state resets
  const [prevMapId, setPrevMapId] = useState(mapConfig?.id);

  // Reset states when map changes (render-time adjustment pattern)
  if (prevMapId !== mapConfig?.id) {
    setPrevMapId(mapConfig?.id);
    setShowLower(false);
    setIsInitialized(false);
    setMapImage(null);
    setAltMapImage(null);
  }

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

  // Track previous showLower for level toggle handling
  const prevShowLowerRef = useRef(showLower);
  const viewStateRef = useRef(viewState);
  const containerSizeRef = useRef(containerSize);
  const mapImageRef = useRef(mapImage);

  // Keep refs in sync
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);
  useEffect(() => {
    containerSizeRef.current = containerSize;
  }, [containerSize]);
  useEffect(() => {
    mapImageRef.current = mapImage;
  }, [mapImage]);

  // Clamp view: enforce minimum zoom (cover fit) and pan bounds (no empty edges)
  const clampView = useCallback(({ zoom, panX, panY }) => {
    const img = mapImageRef.current;
    const cs = containerSizeRef.current;
    if (!img || cs.width === 0) return { zoom, panX, panY };

    const minZoom = Math.max(cs.width / img.width, cs.height / img.height);
    const z = Math.max(minZoom, Math.min(3, zoom));

    const minPanX = cs.width - img.width * z;
    const minPanY = cs.height - img.height * z;

    return {
      zoom: z,
      panX: Math.min(0, Math.max(minPanX, panX)),
      panY: Math.min(0, Math.max(minPanY, panY))
    };
  }, []);

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

      setViewState(clampView({
        zoom: startView.zoom + (targetView.zoom - startView.zoom) * eased,
        panX: startView.panX + (targetView.panX - startView.panX) * eased,
        panY: startView.panY + (targetView.panY - startView.panY) * eased
      }));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Cleanup animation and WebGL on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      const res = glRef.current;
      if (res) {
        const { gl } = res;
        if (res.mainTex) gl.deleteTexture(res.mainTex);
        if (res.altTex) gl.deleteTexture(res.altTex);
        gl.deleteProgram(res.prog);
        gl.deleteShader(res.vs);
        gl.deleteShader(res.fs);
        gl.deleteBuffer(res.buf);
        glRef.current = null;
      }
    };
  }, []);

  // Load map image (or lower variant)
  useEffect(() => {
    const imageSrc = showLower && mapConfig?.lowerImage ? mapConfig.lowerImage : mapConfig?.image;
    if (!imageSrc) return;

    const isLevelToggle = prevShowLowerRef.current !== showLower;

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

    prevShowLowerRef.current = showLower;

    // Track current request to handle race conditions
    let isCancelled = false;

    const img = new Image();
    img.onload = () => {
      if (isCancelled) return;
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
      if (isCancelled) return;
      console.error('Failed to load map image:', imageSrc);
    };
    img.src = imageSrc;

    return () => {
      isCancelled = true;
    };
  }, [mapConfig?.id, mapConfig?.image, mapConfig?.lowerImage, mapConfig?.lowerTransform, mapConfig?.transform, showLower]);

  // Preload the alternate level image for blending
  useEffect(() => {
    if (!mapConfig?.lowerImage || !mapConfig?.image) {
      return;
    }

    // Load the opposite level's image
    let isCancelled = false;
    const altSrc = showLower ? mapConfig.image : mapConfig.lowerImage;
    const img = new Image();
    img.onload = () => {
      if (!isCancelled) setAltMapImage(img);
    };
    img.src = altSrc;

    return () => {
      isCancelled = true;
    };
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

    // Use requestAnimationFrame for initial size to avoid sync setState in effect
    const rafId = requestAnimationFrame(updateSize);
    const timer = setTimeout(updateSize, 100);

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerNode);

    return () => {
      cancelAnimationFrame(rafId);
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
    if (isInitialized) return;

    // Auto-initialize once per map (triggered by async image load)
    const defaultView = calculateDefaultView();
    if (!defaultView) return;

    // Use queueMicrotask to avoid synchronous setState in effect body
    let isCancelled = false;
    queueMicrotask(() => {
      if (isCancelled) return;
      setViewState(defaultView);
      setIsInitialized(true);
    });

    return () => {
      isCancelled = true;
    };
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

  // Render: WebGL for map images, 2D canvas overlay for markers
  useEffect(() => {
    const canvas = canvasRef.current;
    const markerCanvas = markerCanvasRef.current;
    if (!canvas || !markerCanvas || !mapImage || containerSize.width === 0 || containerSize.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.floor(containerSize.width * dpr);
    const pxH = Math.floor(containerSize.height * dpr);

    // --- WebGL map rendering ---

    // Lazy-init WebGL (or re-init if canvas element changed)
    if (!glRef.current || glRef.current.canvas !== canvas) {
      if (glRef.current) {
        const old = glRef.current;
        if (old.mainTex) old.gl.deleteTexture(old.mainTex);
        if (old.altTex) old.gl.deleteTexture(old.altTex);
        old.gl.deleteProgram(old.prog);
        old.gl.deleteShader(old.vs);
        old.gl.deleteShader(old.fs);
        old.gl.deleteBuffer(old.buf);
      }
      glRef.current = initMapGL(canvas);
      if (!glRef.current) return;
    }

    const glRes = glRef.current;
    const { gl, prog, vao, locs } = glRes;

    // Upload/update main texture if image changed
    if (glRes.currentMainImage !== mapImage) {
      if (glRes.mainTex) gl.deleteTexture(glRes.mainTex);
      glRes.mainTex = createMipmapTexture(glRes, mapImage);
      glRes.currentMainImage = mapImage;
      glRes.mainSize = [mapImage.width, mapImage.height];
      const err = gl.getError();
      console.log('[MapViewer] Texture uploaded', mapImage.width, 'x', mapImage.height, err ? `GL_ERROR: ${err}` : 'OK');
    }

    // Upload/update alt texture if image changed
    if (altMapImage && glRes.currentAltImage !== altMapImage) {
      if (glRes.altTex) gl.deleteTexture(glRes.altTex);
      glRes.altTex = createMipmapTexture(glRes, altMapImage);
      glRes.currentAltImage = altMapImage;
      glRes.altSize = [altMapImage.width, altMapImage.height];
    } else if (!altMapImage && glRes.altTex) {
      gl.deleteTexture(glRes.altTex);
      glRes.altTex = null;
      glRes.currentAltImage = null;
    }

    // Resize GL canvas only when needed
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    gl.viewport(0, 0, pxW, pxH);

    // Clear to background color (#0a0a0a)
    gl.clearColor(10/255, 10/255, 10/255, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Pass resolution in CSS pixels (shader converts to clip space)
    gl.uniform2f(locs.res, containerSize.width, containerSize.height);

    const { zoom, panX, panY } = viewState;

    // Draw alternate level image underneath (blended at 35%) if available
    if (glRes.altTex && mapConfig?.lowerTransform && mapConfig?.transform) {
      const altTransform = showLower ? mapConfig.transform : mapConfig.lowerTransform;
      const scaleRatioX = altTransform.scaleX / activeTransform.scaleX;
      const scaleRatioY = altTransform.scaleY / activeTransform.scaleY;
      const mainOriginX = activeTransform.offsetX;
      const mainOriginY = activeTransform.offsetY;
      const altOriginX = altTransform.offsetX;
      const altOriginY = altTransform.offsetY;
      const altPanX = panX + (mainOriginX - altOriginX * scaleRatioX) * zoom;
      const altPanY = panY + (mainOriginY - altOriginY * scaleRatioY) * zoom;
      const altZoom = zoom * Math.min(scaleRatioX, scaleRatioY);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glRes.altTex);
      gl.uniform1i(locs.tex, 0);
      gl.uniform2f(locs.imgSize, glRes.altSize[0], glRes.altSize[1]);
      gl.uniform2f(locs.offset, altPanX, altPanY);
      gl.uniform1f(locs.scale, altZoom);
      gl.uniform1f(locs.alpha, 0.35);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Draw main map image
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glRes.mainTex);
    gl.uniform1i(locs.tex, 0);
    gl.uniform2f(locs.imgSize, glRes.mainSize[0], glRes.mainSize[1]);
    gl.uniform2f(locs.offset, panX, panY);
    gl.uniform1f(locs.scale, zoom);
    gl.uniform1f(locs.alpha, 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // --- 2D marker overlay ---
    if (markerCanvas.width !== pxW || markerCanvas.height !== pxH) {
      markerCanvas.width = pxW;
      markerCanvas.height = pxH;
    }
    const ctx = markerCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.scale(dpr, dpr);

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
    setViewState(prev => clampView({
      ...prev,
      panX: e.clientX - dragStart.x,
      panY: e.clientY - dragStart.y
    }));
  }, [isDragging, dragStart, clampView]);

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
      // Clamp zoom first so pan calculation uses the correct ratio
      const newZoom = clampView({ zoom: prev.zoom * zoomFactor, panX: 0, panY: 0 }).zoom;

      // Zoom towards mouse position
      const newPanX = mouseX - (mouseX - prev.panX) * (newZoom / prev.zoom);
      const newPanY = mouseY - (mouseY - prev.panY) * (newZoom / prev.zoom);

      return clampView({ zoom: newZoom, panX: newPanX, panY: newPanY });
    });
  }, [clampView]);

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
      <canvas
        ref={markerCanvasRef}
        style={containerStyles.markerCanvas}
      />

      {/* Zoom controls */}
      <div style={containerStyles.controls}>
        <button
          style={containerStyles.controlButton}
          onClick={() => setViewState(prev => {
            const newZoom = clampView({ zoom: prev.zoom * 1.3, panX: 0, panY: 0 }).zoom;
            const centerX = containerSize.width / 2;
            const centerY = containerSize.height / 2;
            const newPanX = centerX - (centerX - prev.panX) * (newZoom / prev.zoom);
            const newPanY = centerY - (centerY - prev.panY) * (newZoom / prev.zoom);
            return clampView({ zoom: newZoom, panX: newPanX, panY: newPanY });
          })}
          title="Zoom in"
        >
          +
        </button>
        <button
          style={containerStyles.controlButton}
          onClick={() => setViewState(prev => {
            const newZoom = clampView({ zoom: prev.zoom / 1.3, panX: 0, panY: 0 }).zoom;
            const centerX = containerSize.width / 2;
            const centerY = containerSize.height / 2;
            const newPanX = centerX - (centerX - prev.panX) * (newZoom / prev.zoom);
            const newPanY = centerY - (centerY - prev.panY) * (newZoom / prev.zoom);
            return clampView({ zoom: newZoom, panX: newPanX, panY: newPanY });
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
    cursor: 'grab'
  },
  markerCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none'
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
