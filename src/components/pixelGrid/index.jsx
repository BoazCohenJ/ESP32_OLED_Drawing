import React, { useState, useRef, useEffect } from 'react';
import FreeformMode from './FreeFormMode';
import LineMode from './LineMode';
import ResetButton from './ResetButton';
import { getCoordinates } from './utils';
import CircleMode from './CircleMode';
import BucketFillMode from './BucketFillMode';
import { useUndoRedo } from './useUndoRedo';
import RectangleMode from './RectangleMode';
import ESP32Connection from '../ESP32Connection';
import BMPHandler from '../BMPHandler';

const PixelGrid = () => {
  const [pixels, setPixels] = useState(Array(8192).fill(false));
  const [isLineModeActive, setIsLineModeActive] = useState(false);
  const [isCircleModeActive, setIsCircleModeActive] = useState(false);
  const [isBucketFillModeActive, setIsBucketFillModeActive] = useState(false);
  const [isRectangleModeActive, setIsRectangleModeActive] = useState(false);
  const [previewPixels, setPreviewPixels] = useState(Array(8192).fill(false));
  const isDrawingRef = useRef(false);
  const startPointRef = useRef(null);
  const lastPointRef = useRef(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const currentIndexRef = useRef(null);
  const [brushSize, setBrushSize] = useState(1);
  const [drawColor, setDrawColor] = useState(true); // true for white, false for black
  
  const { addToHistory, undo, redo, canUndo, canRedo } = useUndoRedo(Array(8192).fill(false));

  // Add these new states for brush outline
  const outlineRef = useRef(null);
  const [showOutline, setShowOutline] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !isSpacePressed && currentIndexRef.current !== null) {
        e.preventDefault();
        setIsSpacePressed(true);
        handleMouseDown(currentIndexRef.current);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // Handle Ctrl+Shift+Z (Windows) or Cmd+Shift+Z (Mac)
          handleRedo();
        } else {
          // Handle Ctrl+Z (Windows) or Cmd+Z (Mac)
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        // Add alternative redo shortcut (Ctrl+Y)
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'b') {
        // Shortcut for brush (freeform)
        e.preventDefault();
        setIsLineModeActive(false);
        setIsCircleModeActive(false);
        setIsBucketFillModeActive(false);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(false);
        // Add state to history when space drawing ends
        if (isDrawingRef.current) {
          addToHistory([...pixels]);
        }
        handleMouseUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed, pixels]); // Add pixels to dependencies

  const handlePixelUpdate = (updateFn) => {
    const newPixels = updateFn(pixels);
    setPixels(newPixels);
    // Remove addToHistory from here since we want to add it only on mouse up
  };

  const handleUndo = () => {
    const previousState = undo();
    if (previousState) {
      setPixels(previousState);
    }
  };

  const handleRedo = () => {
    const nextState = redo();
    if (nextState) {
      setPixels(nextState);
    }
  };

  const isFreeformActive = !isLineModeActive && !isCircleModeActive && 
                           !isBucketFillModeActive && !isRectangleModeActive;

  const freeformMode = FreeformMode({
    isActive: isFreeformActive,
    onPixelUpdate: handlePixelUpdate,
    brushSize,
    drawColor
  });

  const lineMode = LineMode({
    isActive: isLineModeActive,
    onPixelUpdate: handlePixelUpdate,
    onPreviewUpdate: setPreviewPixels,
    drawColor  // Pass the color to line mode
  });

  const circleMode = CircleMode({
    isActive: isCircleModeActive,
    onPixelUpdate: handlePixelUpdate,
    onPreviewUpdate: setPreviewPixels,
    drawColor  // Pass the color to circle mode
  });

  const bucketFillMode = BucketFillMode({
    isActive: isBucketFillModeActive,
    onPixelUpdate: handlePixelUpdate,
    drawColor  // Pass the color to bucket fill mode
  });

  const rectangleMode = RectangleMode({
    isActive: isRectangleModeActive,
    onPixelUpdate: handlePixelUpdate,
    onPreviewUpdate: setPreviewPixels,
    drawColor
  });

  const handleMouseDown = (index) => {
    isDrawingRef.current = true;
    
    if (isBucketFillModeActive) {
      // For bucket fill, execute fill immediately
      bucketFillMode.handleFill(index, pixels);
      addToHistory([...pixels]);
      isDrawingRef.current = false;
      return;
    }
    
    if (isFreeformActive) {
      // For freeform mode, draw immediately on click
      const point = getCoordinates(index);
      lastPointRef.current = point;
      freeformMode.handleStart(index);
    } else {
      startPointRef.current = getCoordinates(index);
      lastPointRef.current = getCoordinates(index);
    }
  };

  const handleMouseEnter = (index) => {
    if (!isDrawingRef.current) return;
    
    if (isFreeformActive) {
      // For freeform mode
      lastPointRef.current = freeformMode.handleDraw(lastPointRef.current, index);
    } else if (isLineModeActive) {
      // For line mode
      lineMode.handlePreview(startPointRef.current, index);
      lastPointRef.current = getCoordinates(index);
    } else if (isCircleModeActive) {
      // For circle mode
      circleMode.handlePreview(startPointRef.current, index);
      lastPointRef.current = getCoordinates(index);
    } else if (isRectangleModeActive) {
      // For rectangle mode
      rectangleMode.handlePreview(startPointRef.current, index);
      lastPointRef.current = getCoordinates(index);
    }
  };

  const handleMouseUp = (event) => {
    if (isDrawingRef.current) {
      if ((isLineModeActive || isCircleModeActive || isRectangleModeActive) && 
          startPointRef.current && lastPointRef.current) {
        
        const endIndex = lastPointRef.current.y * 128 + lastPointRef.current.x;
        let updatedPixels = [...pixels];
        
        if (isLineModeActive) {
          const linePoints = lineMode.handleCommit(startPointRef.current, endIndex);
          if (linePoints) {
            linePoints.forEach(idx => {
              updatedPixels[idx] = drawColor;
            });
          }
        } else if (isCircleModeActive) {
          const circlePoints = circleMode.handleCommit(startPointRef.current, endIndex);
          if (circlePoints) {
            circlePoints.forEach(idx => {
              updatedPixels[idx] = drawColor;
            });
          }
        } else if (isRectangleModeActive) {
          const rectanglePoints = rectangleMode.handleCommit(startPointRef.current, endIndex);
          if (rectanglePoints) {
            rectanglePoints.forEach(idx => {
              updatedPixels[idx] = drawColor;
            });
          }
        }
        
        setPixels(updatedPixels);
        setPreviewPixels(Array(8192).fill(false));
        addToHistory(updatedPixels);
      } else if (!isBucketFillModeActive) {
        // For freeform, only save on mouse up
        addToHistory([...pixels]);
      }
    }
    
    isDrawingRef.current = false;
    startPointRef.current = null;
    lastPointRef.current = null;
  };

  const handleReset = () => {
    const newState = Array(8192).fill(false);
    setPixels(newState);
    setPreviewPixels(Array(8192).fill(false));
    startPointRef.current = null;
    lastPointRef.current = null;
    isDrawingRef.current = false;
    addToHistory(newState);
  };

  const handlePixelHover = (index) => {
    currentIndexRef.current = index;
    if (isDrawingRef.current || isSpacePressed) {
      handleMouseEnter(index);
    }
  };

  // This controls whether to show the brush size control
  const showBrushSizeControl = isFreeformActive;

  // Add this effect for handling the brush outline
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!outlineRef.current) return;
      
      // Only show outline for freeform mode
      if (isFreeformActive) {
        const grid = document.querySelector('.pixel-grid');
        if (!grid) return;
        
        const rect = grid.getBoundingClientRect();
        
        // Check if the mouse is within the grid boundaries
        if (e.clientX < rect.left || e.clientX > rect.right || 
            e.clientY < rect.top || e.clientY > rect.bottom) {
          outlineRef.current.style.display = 'none';
          return;
        }
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Calculate which pixel we're hovering over
        const pixelX = Math.floor(mouseX / 8);
        const pixelY = Math.floor(mouseY / 8);
        
        // Ensure we're within grid boundaries
        if (pixelX < 0 || pixelX >= 128 || pixelY < 0 || pixelY >= 64) {
          outlineRef.current.style.display = 'none';
          return;
        }
        
        // Store the current pixel index for consistent drawing
        const currentIndex = pixelY * 128 + pixelX;
        currentIndexRef.current = currentIndex;
        
        if (brushSize === 1) {
          // For brush size 1, just show a simple pixel outline
          outlineRef.current.innerHTML = '';
          outlineRef.current.style.left = `${pixelX * 8}px`;
          outlineRef.current.style.top = `${pixelY * 8}px`;
          outlineRef.current.style.width = `8px`;
          outlineRef.current.style.height = `8px`;
          outlineRef.current.style.display = 'block';
          outlineRef.current.style.border = `1px solid ${drawColor ? 'white' : 'red'}`;
          outlineRef.current.style.borderRadius = '0'; // Ensure square shape
        } else {
          // Create a canvas-based outline for the diamond pattern
          outlineRef.current.style.display = 'block';
          outlineRef.current.style.border = 'none';
          outlineRef.current.innerHTML = '';
          
          const diamondPixels = [];
          
          // Calculate points based on Manhattan distance (diamond pattern)
          for (let y = -brushSize + 1; y < brushSize; y++) {
            for (let x = -brushSize + 1; x < brushSize; x++) {
              if (Math.abs(x) + Math.abs(y) < brushSize) {
                const newX = pixelX + x;
                const newY = pixelY + y;
                
                if (newX >= 0 && newX < 128 && newY >= 0 && newY < 64) {
                  diamondPixels.push({ x: newX, y: newY });
                }
              }
            }
          }
          
          if (diamondPixels.length > 0) {
            // Find bounds of the diamond
            let minX = 128, minY = 64, maxX = 0, maxY = 0;
            
            diamondPixels.forEach(({x, y}) => {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            });
            
            // Set up the canvas that will contain our outline
            const canvas = document.createElement('canvas');
            const width = (maxX - minX + 1) * 8;
            const height = (maxY - minY + 1) * 8;
            canvas.width = width;
            canvas.height = height;
            canvas.style.position = 'absolute';
            canvas.style.left = '0';
            canvas.style.top = '0';
            
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = drawColor ? 'white' : 'red';
            ctx.lineWidth = 1;
            
            // Only create paths for the outline (edges)
            const visited = new Set();
            const drawEdge = (x, y, side) => {
              const key = `${x},${y},${side}`;
              if (visited.has(key)) return;
              visited.add(key);
              
              const pixelX = (x - minX) * 8;
              const pixelY = (y - minY) * 8;
              
              if (side === 'top') {
                ctx.moveTo(pixelX, pixelY);
                ctx.lineTo(pixelX + 8, pixelY);
              } else if (side === 'right') {
                ctx.moveTo(pixelX + 8, pixelY);
                ctx.lineTo(pixelX + 8, pixelY + 8);
              } else if (side === 'bottom') {
                ctx.moveTo(pixelX, pixelY + 8);
                ctx.lineTo(pixelX + 8, pixelY + 8);
              } else if (side === 'left') {
                ctx.moveTo(pixelX, pixelY);
                ctx.lineTo(pixelX, pixelY + 8);
              }
            };
            
            ctx.beginPath();
            
            // Draw only the outer edges
            diamondPixels.forEach(({x, y}) => {
              // Check each neighboring position
              [
                { dx: 0, dy: -1, side: 'top' },
                { dx: 1, dy: 0, side: 'right' },
                { dx: 0, dy: 1, side: 'bottom' },
                { dx: -1, dy: 0, side: 'left' }
              ].forEach(({dx, dy, side}) => {
                const nx = x + dx;
                const ny = y + dy;
                const found = diamondPixels.some(p => p.x === nx && p.y === ny);
                if (!found) {
                  drawEdge(x, y, side);
                }
              });
            });
            
            ctx.stroke();
            
            // Position the container and add the canvas
            outlineRef.current.style.left = `${minX * 8}px`;
            outlineRef.current.style.top = `${minY * 8}px`;
            outlineRef.current.style.width = `${width}px`;
            outlineRef.current.style.height = `${height}px`;
            outlineRef.current.appendChild(canvas);
          }
        }
      } else {
        outlineRef.current.style.display = 'none';
      }
    };
    
    const handleMouseLeave = () => {
      if (outlineRef.current) {
        outlineRef.current.style.display = 'none';
      }
    };
    
    const grid = document.querySelector('.pixel-grid');
    if (grid) {
      grid.addEventListener('mousemove', handleMouseMove);
      grid.addEventListener('mouseleave', handleMouseLeave);
    }
    
    return () => {
      if (grid) {
        grid.removeEventListener('mousemove', handleMouseMove);
        grid.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [brushSize, isFreeformActive, drawColor]); // Add drawColor to dependencies

  // Add this function to toggle the draw color
  const toggleDrawColor = () => {
    setDrawColor(!drawColor);
  };

  // Modify the pixel click handler to use the stored index
  const handlePixelClick = (event) => {
    event.preventDefault();
    
    if (!currentIndexRef.current && currentIndexRef.current !== 0) return;
    
    handleMouseDown(currentIndexRef.current);
  };

  return (
    <div>
      {/* ESP32 Button - fixed to top left */}
      <div className="esp32-container" style={{ 
        position: 'fixed', 
        top: '10px', 
        left: '10px', 
        zIndex: 1000 
      }}>
        <ESP32Connection pixelData={pixels} />
      </div>
      
      {/* BMP Buttons - fixed to top right */}
      <div className="bmp-container" style={{ 
        position: 'fixed', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000 
      }}>
        <BMPHandler pixelData={pixels} onPixelUpdate={setPixels} />
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
      
      {/* Mode buttons - properly positioned */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        width: '100%',
        position: 'relative'
      }}>
        {/* This wrapper ensures buttons are centered correctly over the grid */}
        <div className="mode-buttons-container" style={{
          position: 'relative',
          left: '22px', /* Increased from 15px to 23px to shift buttons more to the right */
          width: '1024px',
          boxSizing: 'border-box',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          <button 
            onClick={() => {
              setIsLineModeActive(false);
              setIsCircleModeActive(false);
              setIsBucketFillModeActive(false);
              setIsRectangleModeActive(false);
              setPreviewPixels(Array(8192).fill(false));
            }}
            className={`mode-button ${isFreeformActive ? 'active' : ''}`}
          >
            {freeformMode.modeName}
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
            {lineMode.modeName}
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
            {circleMode.modeName}
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
            {rectangleMode.modeName}
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
            {bucketFillMode.modeName}
          </button>
          <button 
            onClick={handleUndo}
            className="mode-button"
            disabled={!canUndo}
            style={{ marginLeft: 'auto' }}
          >
            Undo
          </button>
          <button 
            onClick={handleRedo}
            className="mode-button"
            disabled={!canRedo}
          >
            Redo
          </button>
        </div>
      </div>
      
      <div className="drawing-area">
        {/* Color selection squares - left side of grid */}
        <div className="color-selector" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          marginRight: '15px'
        }}>
          <div 
            onClick={() => setDrawColor(true)}
            className="color-button"
            style={{
              width: '30px',
              height: '30px',
              backgroundColor: '#fff',
              border: drawColor ? '3px solid #2196F3' : '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer',
              boxSizing: 'border-box',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}
            title="White (Draw)"
          />
          <div 
            onClick={() => setDrawColor(false)}
            className="color-button"
            style={{
              width: '30px',
              height: '30px',
              backgroundColor: '#000',
              border: !drawColor ? '3px solid #ff4444' : '1px solid #666',
              borderRadius: '4px',
              cursor: 'pointer',
              boxSizing: 'border-box',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}
            title="Black (Eraser)"
          />
        </div>
        
        <div 
          className="pixel-grid"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Brush outline */}
          <div 
            className="brush-outline" 
            ref={outlineRef}
            style={{ 
              borderColor: drawColor ? 'white' : 'red'
            }}
          ></div>
          
          {/* Pixels */}
          {pixels.map((isWhite, index) => (
            <div
              key={index}
              className={`pixel ${
                // Change the order: check previews first, then actual pixel state
                previewPixels[index] === true ? 'white' :
                previewPixels[index] === 'black-preview' ? 'black-preview' : 
                isWhite ? 'white' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent dragging
                handleMouseDown(index);
              }}
              onMouseEnter={() => handlePixelHover(index)}
              draggable="false"
              style={{ 
                cursor: isFreeformActive ? 'none' : 
                        isBucketFillModeActive ? 'cell' : 'crosshair'
              }}
            />
          ))}
        </div>
      </div>
      
      <ResetButton onReset={handleReset} />
    </div>
  );
};

export default PixelGrid;