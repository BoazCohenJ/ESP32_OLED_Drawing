import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { drawLine } from './utils';
import ESP32Connection from '../ESP32Connection';
import BMPHandler from '../BMPHandler';
import ResetButton from './ResetButton';

const GRID_WIDTH = 128;
const GRID_HEIGHT = 64;
const PIXEL_SIZE = 8;
const TOTAL_PIXELS = GRID_WIDTH * GRID_HEIGHT;

const PixelGrid = () => {
  // Use Uint8Array for better performance (0 = black, 1 = white)
  const [pixels, setPixels] = useState(() => new Uint8Array(TOTAL_PIXELS));
  const [previewPixels, setPreviewPixels] = useState(() => new Uint8Array(TOTAL_PIXELS));
  
  const [isLineModeActive, setIsLineModeActive] = useState(false);
  const [isCircleModeActive, setIsCircleModeActive] = useState(false);
  const [isBucketFillModeActive, setIsBucketFillModeActive] = useState(false);
  const [isRectangleModeActive, setIsRectangleModeActive] = useState(false);
  
  const isDrawingRef = useRef(false);
  const startPointRef = useRef(null);
  const lastPointRef = useRef(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const currentIndexRef = useRef(null);
  const [brushSize, setBrushSize] = useState(1);
  const [drawColor, setDrawColor] = useState(true);
  
  // Canvas refs
  const canvasRef = useRef(null);
  const brushCanvasRef = useRef(null);
  const renderRequestRef = useRef(null);
  const pixelsRef = useRef(pixels);
  const previewPixelsRef = useRef(previewPixels);
  
  // FPS counter
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  // History for undo/redo - optimized
  const historyRef = useRef([new Uint8Array(TOTAL_PIXELS)]);
  const historyIndexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const addToHistory = useCallback((newState) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(new Uint8Array(newState));
    if (newHistory.length > 100) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const state = new Uint8Array(historyRef.current[historyIndexRef.current]);
      setPixels(state);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const state = new Uint8Array(historyRef.current[historyIndexRef.current]);
      setPixels(state);
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }
  }, []);

  // Keep pixelsRef in sync
  useEffect(() => {
    pixelsRef.current = pixels;
  }, [pixels]);
  
  useEffect(() => {
    previewPixelsRef.current = previewPixels;
  }, [previewPixels]);

  // Optimized canvas render function
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    const imageData = ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    const data = imageData.data;
    
    const currentPixels = pixelsRef.current;
    const currentPreview = previewPixelsRef.current;
    
    for (let i = 0; i < TOTAL_PIXELS; i++) {
      const offset = i * 4;
      if (currentPreview[i] === 1) {
        // White preview
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      } else if (currentPreview[i] === 2) {
        // Black preview (dark gray for visibility)
        data[offset] = 34;
        data[offset + 1] = 34;
        data[offset + 2] = 34;
      } else if (currentPixels[i] === 1) {
        // White pixel
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      } else {
        // Black pixel (background)
        data[offset] = 17;
        data[offset + 1] = 17;
        data[offset + 2] = 17;
      }
      data[offset + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // FPS counting
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, []);

  // Schedule render with requestAnimationFrame
  const scheduleRender = useCallback(() => {
    if (renderRequestRef.current) return;
    renderRequestRef.current = requestAnimationFrame(() => {
      renderCanvas();
      renderRequestRef.current = null;
    });
  }, [renderCanvas]);

  // Render on pixel changes
  useEffect(() => {
    scheduleRender();
  }, [pixels, previewPixels, scheduleRender]);

  // Initial render
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const isFreeformActive = !isLineModeActive && !isCircleModeActive && 
                           !isBucketFillModeActive && !isRectangleModeActive;

  // Drawing utility functions
  const getLinePoints = useCallback((start, end) => {
    const points = [];
    let x0 = Math.max(0, Math.min(127, start.x));
    let y0 = Math.max(0, Math.min(63, start.y));
    let x1 = Math.max(0, Math.min(127, end.x));
    let y1 = Math.max(0, Math.min(63, end.y));

    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }

    const dx = x1 - x0;
    const dy = Math.abs(y1 - y0);
    const yStep = y0 < y1 ? 1 : -1;
    let error = dx / 2;
    let y = y0;

    for (let x = x0; x <= x1; x++) {
      const currentX = steep ? y : x;
      const currentY = steep ? x : y;
      const index = currentY * GRID_WIDTH + currentX;
      if (index >= 0 && index < TOTAL_PIXELS) points.push(index);
      error -= dy;
      if (error < 0) { y += yStep; error += dx; }
    }
    return points;
  }, []);

  const getCirclePoints = useCallback((center, point) => {
    const points = [];
    const radius = Math.floor(Math.sqrt(
      Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
    ));

    let x = radius, y = 0, error = 0;
    while (x >= y) {
      const coords = [
        [center.x + x, center.y + y], [center.x + y, center.y + x],
        [center.x - y, center.y + x], [center.x - x, center.y + y],
        [center.x - x, center.y - y], [center.x - y, center.y - x],
        [center.x + y, center.y - x], [center.x + x, center.y - y],
      ];
      coords.forEach(([px, py]) => {
        if (px >= 0 && px < GRID_WIDTH && py >= 0 && py < GRID_HEIGHT) {
          points.push(py * GRID_WIDTH + px);
        }
      });
      y++;
      error += 1 + 2 * y;
      if (2 * (error - x) + 1 > 0) { x--; error += 1 - 2 * x; }
    }
    return points;
  }, []);

  const getRectPoints = useCallback((start, end) => {
    const points = [];
    const startX = Math.max(0, Math.min(start.x, end.x));
    const startY = Math.max(0, Math.min(start.y, end.y));
    const endX = Math.min(127, Math.max(start.x, end.x));
    const endY = Math.min(63, Math.max(start.y, end.y));
    
    for (let x = startX; x <= endX; x++) {
      if (startY >= 0 && startY < GRID_HEIGHT) points.push(startY * GRID_WIDTH + x);
      if (endY >= 0 && endY < GRID_HEIGHT && endY !== startY) points.push(endY * GRID_WIDTH + x);
    }
    for (let y = startY + 1; y < endY; y++) {
      if (startX >= 0 && startX < GRID_WIDTH) points.push(y * GRID_WIDTH + startX);
      if (endX >= 0 && endX < GRID_WIDTH && endX !== startX) points.push(y * GRID_WIDTH + endX);
    }
    return points;
  }, []);

  // Get brush pattern points
  const getBrushPoints = useCallback((centerX, centerY, size) => {
    const points = [];
    for (let offset = 0; offset < size; offset++) {
      for (let i = -offset; i <= offset; i++) {
        const coords = [
          { x: centerX + i, y: centerY - (size - 1 - offset) },
          { x: centerX + i, y: centerY + (size - 1 - offset) },
          { x: centerX - (size - 1 - offset), y: centerY + i },
          { x: centerX + (size - 1 - offset), y: centerY + i }
        ];
        coords.forEach(point => {
          if (point.x >= 0 && point.x < GRID_WIDTH && point.y >= 0 && point.y < GRID_HEIGHT) {
            points.push(point.y * GRID_WIDTH + point.x);
          }
        });
      }
    }
    return points;
  }, []);

  // Get coordinates from canvas position
  const getCanvasCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = GRID_WIDTH / rect.width;
    const scaleY = GRID_HEIGHT / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    return { x, y };
  }, []);

  // Bucket fill
  const handleBucketFill = useCallback((index) => {
    const currentPixels = pixelsRef.current;
    const targetColor = currentPixels[index];
    const fillColor = drawColor ? 1 : 0;
    if (targetColor === fillColor) return;

    const newPixels = new Uint8Array(currentPixels);
    const stack = [index];
    const visited = new Set();

    while (stack.length > 0) {
      const currentIndex = stack.pop();
      if (visited.has(currentIndex) || newPixels[currentIndex] !== targetColor) continue;
      visited.add(currentIndex);
      newPixels[currentIndex] = fillColor;

      const x = currentIndex % GRID_WIDTH;
      const y = Math.floor(currentIndex / GRID_WIDTH);

      if (x > 0) stack.push(currentIndex - 1);
      if (x < GRID_WIDTH - 1) stack.push(currentIndex + 1);
      if (y > 0) stack.push(currentIndex - GRID_WIDTH);
      if (y < GRID_HEIGHT - 1) stack.push(currentIndex + GRID_WIDTH);
    }

    setPixels(newPixels);
    addToHistory(newPixels);
  }, [drawColor, addToHistory]);

  // Mouse event handlers
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    isDrawingRef.current = true;
    
    if (isBucketFillModeActive) {
      // Only bucket fill if click is within grid
      if (coords.x >= 0 && coords.x < GRID_WIDTH && coords.y >= 0 && coords.y < GRID_HEIGHT) {
        const index = coords.y * GRID_WIDTH + coords.x;
        currentIndexRef.current = index;
        handleBucketFill(index);
      }
      isDrawingRef.current = false;
      return;
    }
    
    if (isFreeformActive) {
      // Allow drawing even if mouse is outside grid - draw any pixels that fall within grid
      lastPointRef.current = { x: coords.x, y: coords.y };
      const points = getBrushPoints(coords.x, coords.y, brushSize);
      if (points.length > 0) {
        setPixels(prev => {
          const newPixels = new Uint8Array(prev);
          points.forEach(idx => { newPixels[idx] = drawColor ? 1 : 0; });
          return newPixels;
        });
      }
    } else {
      startPointRef.current = coords;
      lastPointRef.current = coords;
    }
  }, [isBucketFillModeActive, isFreeformActive, handleBucketFill, getCanvasCoordinates, getBrushPoints, brushSize, drawColor]);

  const handleCanvasMouseMove = useCallback((e) => {
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    // Update brush outline
    updateBrushOutline(e);
    
    if (!isDrawingRef.current) return;
    
    // If we're drawing but have no last point (we left the grid earlier), and now re-enter,
    // draw a disconnected segment (no connecting line)
    if (isFreeformActive && !lastPointRef.current) {
      const currentPoints = getBrushPoints(coords.x, coords.y, brushSize);
      if (currentPoints.length > 0) {
        setPixels(prev => {
          const newPixels = new Uint8Array(prev);
          currentPoints.forEach(idx => {
            if (idx >= 0 && idx < TOTAL_PIXELS) newPixels[idx] = drawColor ? 1 : 0;
          });
          return newPixels;
        });
        lastPointRef.current = { x: coords.x, y: coords.y };
      }
      return;
    }
    
    if (isFreeformActive && lastPointRef.current) {
      // Check if we have any pixels within the grid from the brush at current position
      const currentPoints = getBrushPoints(coords.x, coords.y, brushSize);
      const lastPoints = getBrushPoints(lastPointRef.current.x, lastPointRef.current.y, brushSize);
      
      // Determine if we should draw a connecting line or start fresh
      const lastWasInGrid = lastPoints.length > 0;
      const currentIsInGrid = currentPoints.length > 0;
      
      if (!currentIsInGrid) {
        // Outside grid, just update position without drawing
        lastPointRef.current = { x: coords.x, y: coords.y };
      } else if (!lastWasInGrid) {
        // Re-entering grid from outside - start fresh without connecting line
        setPixels(prev => {
          const newPixels = new Uint8Array(prev);
          currentPoints.forEach(idx => {
            if (idx >= 0 && idx < TOTAL_PIXELS) {
              newPixels[idx] = drawColor ? 1 : 0;
            }
          });
          return newPixels;
        });
        lastPointRef.current = { x: coords.x, y: coords.y };
      } else {
        // Both last and current positions are in grid - draw connecting line
        // Only draw line between points that are both within reasonable grid bounds
        const lastInBounds = lastPointRef.current.x >= -brushSize && lastPointRef.current.x < GRID_WIDTH + brushSize &&
                             lastPointRef.current.y >= -brushSize && lastPointRef.current.y < GRID_HEIGHT + brushSize;
        const currentInBounds = coords.x >= -brushSize && coords.x < GRID_WIDTH + brushSize &&
                                coords.y >= -brushSize && coords.y < GRID_HEIGHT + brushSize;
        
        if (lastInBounds && currentInBounds) {
          const linePoints = getLinePoints(lastPointRef.current, { x: coords.x, y: coords.y });
          const allPoints = [];
          linePoints.forEach(idx => {
            const centerX = idx % GRID_WIDTH;
            const centerY = Math.floor(idx / GRID_WIDTH);
            if (centerX >= 0 && centerX < GRID_WIDTH && centerY >= 0 && centerY < GRID_HEIGHT) {
              allPoints.push(...getBrushPoints(centerX, centerY, brushSize));
            }
          });
          
          setPixels(prev => {
            const newPixels = new Uint8Array(prev);
            allPoints.forEach(idx => {
              if (idx >= 0 && idx < TOTAL_PIXELS) {
                newPixels[idx] = drawColor ? 1 : 0;
              }
            });
            return newPixels;
          });
        } else {
          // If coordinates are too far out of bounds, just draw current position
          setPixels(prev => {
            const newPixels = new Uint8Array(prev);
            currentPoints.forEach(idx => {
              if (idx >= 0 && idx < TOTAL_PIXELS) {
                newPixels[idx] = drawColor ? 1 : 0;
              }
            });
            return newPixels;
          });
        }
        lastPointRef.current = { x: coords.x, y: coords.y };
      }
    } else if (isLineModeActive && startPointRef.current) {
      const points = getLinePoints(startPointRef.current, coords);
      const newPreview = new Uint8Array(TOTAL_PIXELS);
      points.forEach(idx => { newPreview[idx] = drawColor ? 1 : 2; });
      setPreviewPixels(newPreview);
      lastPointRef.current = coords;
    } else if (isCircleModeActive && startPointRef.current) {
      const points = getCirclePoints(startPointRef.current, coords);
      const newPreview = new Uint8Array(TOTAL_PIXELS);
      points.forEach(idx => { newPreview[idx] = drawColor ? 1 : 2; });
      setPreviewPixels(newPreview);
      lastPointRef.current = coords;
    } else if (isRectangleModeActive && startPointRef.current) {
      const points = getRectPoints(startPointRef.current, coords);
      const newPreview = new Uint8Array(TOTAL_PIXELS);
      points.forEach(idx => { newPreview[idx] = drawColor ? 1 : 2; });
      setPreviewPixels(newPreview);
      lastPointRef.current = coords;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeformActive, isLineModeActive, isCircleModeActive, isRectangleModeActive,
      getCanvasCoordinates, getBrushPoints, getLinePoints, getCirclePoints, getRectPoints,
      brushSize, drawColor]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    
    if ((isLineModeActive || isCircleModeActive || isRectangleModeActive) && 
        startPointRef.current && lastPointRef.current) {
      
      let points = [];
      if (isLineModeActive) {
        points = getLinePoints(startPointRef.current, lastPointRef.current);
      } else if (isCircleModeActive) {
        points = getCirclePoints(startPointRef.current, lastPointRef.current);
      } else if (isRectangleModeActive) {
        points = getRectPoints(startPointRef.current, lastPointRef.current);
      }
      
      if (points.length > 0) {
        setPixels(prev => {
          const newPixels = new Uint8Array(prev);
          points.forEach(idx => {
            if (idx >= 0 && idx < TOTAL_PIXELS) {
              newPixels[idx] = drawColor ? 1 : 0;
            }
          });
          // Add to history after state update
          setTimeout(() => addToHistory(newPixels), 0);
          return newPixels;
        });
      }
      setPreviewPixels(new Uint8Array(TOTAL_PIXELS));
    } else if (isFreeformActive) {
      addToHistory(pixelsRef.current);
    }
    
    isDrawingRef.current = false;
    startPointRef.current = null;
    lastPointRef.current = null;
  }, [isLineModeActive, isCircleModeActive, isRectangleModeActive, isFreeformActive,
      drawColor, getLinePoints, getCirclePoints, getRectPoints, addToHistory]);

  // Global mouse events for drawing outside the grid
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDrawingRef.current && (isLineModeActive || isCircleModeActive || isRectangleModeActive)) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = GRID_WIDTH / rect.width;
        const scaleY = GRID_HEIGHT / rect.height;
        
        // Allow coordinates outside the grid
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        const coords = { x, y };
        
        let points = [];
        if (isLineModeActive && startPointRef.current) {
          points = getLinePoints(startPointRef.current, coords);
        } else if (isCircleModeActive && startPointRef.current) {
          points = getCirclePoints(startPointRef.current, coords);
        } else if (isRectangleModeActive && startPointRef.current) {
          points = getRectPoints(startPointRef.current, coords);
        }
        
        const newPreview = new Uint8Array(TOTAL_PIXELS);
        points.forEach(idx => { newPreview[idx] = drawColor ? 1 : 2; });
        setPreviewPixels(newPreview);
        lastPointRef.current = coords;
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDrawingRef.current) {
        handleMouseUp();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isLineModeActive, isCircleModeActive, isRectangleModeActive, drawColor,
      getLinePoints, getCirclePoints, getRectPoints, handleMouseUp]);

  // Global freeform drawing while dragging outside the grid
  useEffect(() => {
    if (!isFreeformActive) return;

    const handleGlobalFreeformMove = (e) => {
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = GRID_WIDTH / rect.width;
      const scaleY = GRID_HEIGHT / rect.height;

      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      if (lastPointRef.current) {
        const linePoints = getLinePoints(lastPointRef.current, { x, y });
        const allPoints = [];
        linePoints.forEach(idx => {
          const centerX = idx % GRID_WIDTH;
          const centerY = Math.floor(idx / GRID_WIDTH);
          if (centerX >= 0 && centerX < GRID_WIDTH && centerY >= 0 && centerY < GRID_HEIGHT) {
            allPoints.push(...getBrushPoints(centerX, centerY, brushSize));
          }
        });

        if (allPoints.length > 0) {
          setPixels(prev => {
            const newPixels = new Uint8Array(prev);
            allPoints.forEach(idx => {
              if (idx >= 0 && idx < TOTAL_PIXELS) newPixels[idx] = drawColor ? 1 : 0;
            });
            return newPixels;
          });
        }
      } else {
        // No last point (e.g., started outside and re-entered); just draw current brush overlap
        const points = getBrushPoints(x, y, brushSize);
        if (points.length > 0) {
          setPixels(prev => {
            const newPixels = new Uint8Array(prev);
            points.forEach(idx => {
              if (idx >= 0 && idx < TOTAL_PIXELS) newPixels[idx] = drawColor ? 1 : 0;
            });
            return newPixels;
          });
        }
      }

      lastPointRef.current = { x, y };
    };

    window.addEventListener('mousemove', handleGlobalFreeformMove);
    return () => window.removeEventListener('mousemove', handleGlobalFreeformMove);
  }, [isFreeformActive, brushSize, drawColor, getBrushPoints, drawLine]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isSpacePressed && currentIndexRef.current !== null) {
        e.preventDefault();
        setIsSpacePressed(true);
        // Trigger drawing at current position
        const index = currentIndexRef.current;
        isDrawingRef.current = true;
        if (isFreeformActive) {
          const x = index % GRID_WIDTH;
          const y = Math.floor(index / GRID_WIDTH);
          lastPointRef.current = { x, y };
          const points = getBrushPoints(x, y, brushSize);
          setPixels(prev => {
            const newPixels = new Uint8Array(prev);
            points.forEach(idx => { newPixels[idx] = drawColor ? 1 : 0; });
            return newPixels;
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'b') {
        e.preventDefault();
        setIsLineModeActive(false);
        setIsCircleModeActive(false);
        setIsBucketFillModeActive(false);
        setIsRectangleModeActive(false);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
        if (isDrawingRef.current) {
          addToHistory(pixelsRef.current);
          isDrawingRef.current = false;
          lastPointRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, isFreeformActive, brushSize, drawColor, getBrushPoints, undo, redo, addToHistory]);

  // Brush outline rendering
  const updateBrushOutline = useCallback((e) => {
    const brushCanvas = brushCanvasRef.current;
    if (!brushCanvas || !isFreeformActive) {
      if (brushCanvas) brushCanvas.style.display = 'none';
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    
    // Calculate pixel position (allow outside bounds)
    const scaleX = GRID_WIDTH / rect.width;
    const scaleY = GRID_HEIGHT / rect.height;
    const pixelX = Math.floor((e.clientX - rect.left) * scaleX);
    const pixelY = Math.floor((e.clientY - rect.top) * scaleY);

    const ctx = brushCanvas.getContext('2d');
    ctx.clearRect(0, 0, brushCanvas.width, brushCanvas.height);
    ctx.strokeStyle = drawColor ? '#fff' : '#f00';
    ctx.lineWidth = 1;

    if (brushSize === 1) {
      // Only draw if any part would be visible in the grid
      if (pixelX >= 0 && pixelX < GRID_WIDTH && pixelY >= 0 && pixelY < GRID_HEIGHT) {
        ctx.strokeRect(pixelX * PIXEL_SIZE + 0.5, pixelY * PIXEL_SIZE + 0.5, PIXEL_SIZE - 1, PIXEL_SIZE - 1);
      }
    } else {
      const diamondPixels = [];
      for (let y = -brushSize + 1; y < brushSize; y++) {
        for (let x = -brushSize + 1; x < brushSize; x++) {
          if (Math.abs(x) + Math.abs(y) < brushSize) {
            const newX = pixelX + x;
            const newY = pixelY + y;
            // Include pixels even outside grid for outline calculation
            if (newX >= 0 && newX < GRID_WIDTH && newY >= 0 && newY < GRID_HEIGHT) {
              diamondPixels.push({ x: newX, y: newY });
            }
          }
        }
      }

      if (diamondPixels.length > 0) {
        ctx.beginPath();
        diamondPixels.forEach(({ x, y }) => {
          [{ dx: 0, dy: -1, side: 'top' }, { dx: 1, dy: 0, side: 'right' },
           { dx: 0, dy: 1, side: 'bottom' }, { dx: -1, dy: 0, side: 'left' }]
          .forEach(({ dx, dy, side }) => {
            const nx = x + dx;
            const ny = y + dy;
            if (!diamondPixels.some(p => p.x === nx && p.y === ny)) {
              const px = x * PIXEL_SIZE;
              const py = y * PIXEL_SIZE;
              if (side === 'top') { ctx.moveTo(px, py); ctx.lineTo(px + PIXEL_SIZE, py); }
              else if (side === 'right') { ctx.moveTo(px + PIXEL_SIZE, py); ctx.lineTo(px + PIXEL_SIZE, py + PIXEL_SIZE); }
              else if (side === 'bottom') { ctx.moveTo(px, py + PIXEL_SIZE); ctx.lineTo(px + PIXEL_SIZE, py + PIXEL_SIZE); }
              else if (side === 'left') { ctx.moveTo(px, py); ctx.lineTo(px, py + PIXEL_SIZE); }
            }
          });
        });
        ctx.stroke();
      }
    }

    brushCanvas.style.display = 'block';
  }, [isFreeformActive, brushSize, drawColor]);

  // Update brush outline on global mouse move for freeform mode
  useEffect(() => {
    if (!isFreeformActive) return;

    const handleGlobalMouseMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Determine if we're reasonably close to the canvas
      const margin = brushSize * PIXEL_SIZE * 2; // Allow brush size distance from edges
      if (
        e.clientX >= rect.left - margin &&
        e.clientX <= rect.right + margin &&
        e.clientY >= rect.top - margin &&
        e.clientY <= rect.bottom + margin
      ) {
        updateBrushOutline(e);
      } else {
        // Hide if too far from canvas and break any in-progress freeform stroke so re-entry doesn't connect
        const brushCanvas = brushCanvasRef.current;
        if (brushCanvas) brushCanvas.style.display = 'none';
        if (isDrawingRef.current) {
          lastPointRef.current = null;
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isFreeformActive, brushSize, updateBrushOutline, getBrushPoints, drawColor]);

  // Allow drawing when the user presses outside the canvas if part of the brush overlaps the grid
  useEffect(() => {
    if (!isFreeformActive) return;

    const handleGlobalMouseDown = (e) => {
      if (e.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = GRID_WIDTH / rect.width;
      const scaleY = GRID_HEIGHT / rect.height;
      const pixelX = Math.floor((e.clientX - rect.left) * scaleX);
      const pixelY = Math.floor((e.clientY - rect.top) * scaleY);

      // Get brush pixels (this will only include points inside the grid)
      const points = getBrushPoints(pixelX, pixelY, brushSize);
      if (points.length === 0) return;

      isDrawingRef.current = true;
      currentIndexRef.current = points[0];

      setPixels(prev => {
        const newPixels = new Uint8Array(prev);
        points.forEach(idx => {
          if (idx >= 0 && idx < TOTAL_PIXELS) newPixels[idx] = drawColor ? 1 : 0;
        });
        return newPixels;
      });

      // Set last point to the clicked logical position (may be outside bounds)
      lastPointRef.current = { x: pixelX, y: pixelY };
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [isFreeformActive, brushSize, getBrushPoints, drawColor]);

  const handleReset = useCallback(() => {
    const newState = new Uint8Array(TOTAL_PIXELS);
    setPixels(newState);
    setPreviewPixels(new Uint8Array(TOTAL_PIXELS));
    startPointRef.current = null;
    lastPointRef.current = null;
    isDrawingRef.current = false;
    addToHistory(newState);
  }, [addToHistory]);

  // Convert Uint8Array to boolean array for ESP32Connection and BMPHandler compatibility
  const pixelsAsBoolArray = useMemo(() => {
    return Array.from(pixels).map(p => p === 1);
  }, [pixels]);

  const handleBMPPixelUpdate = useCallback((newPixels) => {
    if (Array.isArray(newPixels)) {
      const uint8Pixels = new Uint8Array(TOTAL_PIXELS);
      newPixels.forEach((val, i) => {
        uint8Pixels[i] = val ? 1 : 0;
      });
      setPixels(uint8Pixels);
      addToHistory(uint8Pixels);
    }
  }, [addToHistory]);

  const showBrushSizeControl = isFreeformActive;

  return (
    <div className="pixel-grid-container">
      {/* FPS Counter */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: fps < 30 ? '#ff4444' : fps < 50 ? '#ffaa00' : '#44ff44',
        padding: '5px 15px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 1001
      }}>
        FPS: {fps}
      </div>

      {/* ESP32 Button */}
      <div className="esp32-container" style={{ position: 'fixed', top: '10px', left: '10px', zIndex: 1000 }}>
        <ESP32Connection pixelData={pixelsAsBoolArray} />
      </div>
      
      {/* BMP Buttons */}
      <div className="bmp-container" style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 1000 }}>
        <BMPHandler pixelData={pixelsAsBoolArray} onPixelUpdate={handleBMPPixelUpdate} />
      </div>

      {/* Brush size control */}
      <div className="brush-size-control" style={{ visibility: showBrushSizeControl ? 'visible' : 'hidden' }}>
        <label htmlFor="brushSize" style={{ color: 'white', minWidth: '100px' }}>
          Brush Size: {brushSize}
        </label>
        <input
          type="range"
          id="brushSize"
          className="brush-size-slider"
          min="1"
          max="5"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
        />
      </div>
      
      {/* Mode buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', position: 'relative' }}>
        <div className="mode-buttons-container" style={{
          position: 'relative', left: '22px', width: '1024px',
          boxSizing: 'border-box', marginLeft: 'auto', marginRight: 'auto'
        }}>
          <button 
            onClick={() => {
              setIsLineModeActive(false);
              setIsCircleModeActive(false);
              setIsBucketFillModeActive(false);
              setIsRectangleModeActive(false);
              setPreviewPixels(new Uint8Array(TOTAL_PIXELS));
            }}
            className={`mode-button ${isFreeformActive ? 'active' : ''}`}
          >
            Freeform Mode
          </button>
          <button 
            onClick={() => {
              setIsLineModeActive(true);
              setIsCircleModeActive(false);
              setIsBucketFillModeActive(false);
              setIsRectangleModeActive(false);
            }}
            className={`mode-button ${isLineModeActive ? 'active' : ''}`}
          >
            Line Mode
          </button>
          <button 
            onClick={() => {
              setIsLineModeActive(false);
              setIsCircleModeActive(true);
              setIsBucketFillModeActive(false);
              setIsRectangleModeActive(false);
            }}
            className={`mode-button ${isCircleModeActive ? 'active' : ''}`}
          >
            Circle Mode
          </button>
          <button 
            onClick={() => {
              setIsLineModeActive(false);
              setIsCircleModeActive(false);
              setIsBucketFillModeActive(false);
              setIsRectangleModeActive(true);
            }}
            className={`mode-button ${isRectangleModeActive ? 'active' : ''}`}
          >
            Rectangle Mode
          </button>
          <button 
            onClick={() => {
              setIsLineModeActive(false);
              setIsCircleModeActive(false);
              setIsBucketFillModeActive(true);
              setIsRectangleModeActive(false);
            }}
            className={`mode-button ${isBucketFillModeActive ? 'active' : ''}`}
          >
            Bucket Fill
          </button>
          <button onClick={undo} className="mode-button" disabled={!canUndo} style={{ marginLeft: 'auto' }}>
            Undo
          </button>
          <button onClick={redo} className="mode-button" disabled={!canRedo}>
            Redo
          </button>
        </div>
      </div>
      
      <div className="drawing-area">
        {/* Color selection */}
        <div className="color-selector" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginRight: '15px' }}>
          <div 
            onClick={() => setDrawColor(true)}
            style={{
              width: '30px', height: '30px', backgroundColor: '#fff',
              border: drawColor ? '3px solid #2196F3' : '1px solid #666',
              borderRadius: '4px', cursor: 'pointer', boxSizing: 'border-box',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}
            title="White (Draw)"
          />
          <div 
            onClick={() => setDrawColor(false)}
            style={{
              width: '30px', height: '30px', backgroundColor: '#000',
              border: !drawColor ? '3px solid #ff4444' : '1px solid #666',
              borderRadius: '4px', cursor: 'pointer', boxSizing: 'border-box',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}
            title="Black (Eraser)"
          />
        </div>
        
        {/* Canvas-based pixel grid */}
        <div 
          className="canvas-container"
          style={{ position: 'relative', width: `${GRID_WIDTH * PIXEL_SIZE}px`, height: `${GRID_HEIGHT * PIXEL_SIZE}px` }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (brushCanvasRef.current) brushCanvasRef.current.style.display = 'none';
            // When the mouse leaves the canvas while freeform-drawing, break the stroke so re-entry doesn't connect
            if (isFreeformActive && isDrawingRef.current) {
              lastPointRef.current = null;
            }
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            width={GRID_WIDTH}
            height={GRID_HEIGHT}
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated',
              cursor: isFreeformActive ? 'none' : isBucketFillModeActive ? 'cell' : 'crosshair',
              border: '1px solid #666'
            }}
          />
          <canvas
            ref={brushCanvasRef}
            width={GRID_WIDTH * PIXEL_SIZE}
            height={GRID_HEIGHT * PIXEL_SIZE}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              display: 'none'
            }}
          />
        </div>
      </div>
      
      <ResetButton onReset={handleReset} />
    </div>
  );
};

export default PixelGrid;
