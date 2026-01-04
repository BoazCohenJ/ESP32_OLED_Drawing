import React from 'react';

const getCoordinates = (index) => ({
  x: index % 128,
  y: Math.floor(index / 128)
});

const getIndex = (x, y) => y * 128 + x;

const drawRectangle = (start, end) => {
  const points = [];
  const startX = Math.min(start.x, end.x);
  const startY = Math.min(start.y, end.y);
  const endX = Math.max(start.x, end.x);
  const endY = Math.max(start.y, end.y);
  
  // Draw the rectangle perimeter
  for (let x = startX; x <= endX; x++) {
    // Draw top and bottom lines
    if (startX <= x && x <= endX) {
      if (startY >= 0 && startY < 64) {
        const topIndex = getIndex(x, startY);
        if (topIndex >= 0 && topIndex < 8192) points.push(topIndex);
      }
      
      if (endY >= 0 && endY < 64) {
        const bottomIndex = getIndex(x, endY);
        if (bottomIndex >= 0 && bottomIndex < 8192) points.push(bottomIndex);
      }
    }
  }
  
  // Draw left and right lines (avoiding corners which are already drawn)
  for (let y = startY + 1; y < endY; y++) {
    // Draw left and right lines
    if (startY < y && y < endY) {
      if (startX >= 0 && startX < 128) {
        const leftIndex = getIndex(startX, y);
        if (leftIndex >= 0 && leftIndex < 8192) points.push(leftIndex);
      }
      
      if (endX >= 0 && endX < 128) {
        const rightIndex = getIndex(endX, y);
        if (rightIndex >= 0 && rightIndex < 8192) points.push(rightIndex);
      }
    }
  }
  
  return points;
};

const RectangleMode = ({ isActive, onPixelUpdate, onPreviewUpdate, drawColor = true }) => {
  const updateRectangle = (startPoint, endPoint) => {
    if (!startPoint || !endPoint) return;
    
    const rectanglePoints = drawRectangle(startPoint, endPoint);
    const newPreview = Array(8192).fill(false);
    rectanglePoints.forEach(idx => {
      newPreview[idx] = drawColor ? true : 'black-preview';
    });
    
    return newPreview;
  };

  const handlePreview = (startPoint, currentIndex) => {
    if (!startPoint || typeof currentIndex !== 'number') return;
    const currentPoint = getCoordinates(currentIndex);
    const previewState = updateRectangle(startPoint, currentPoint);
    onPreviewUpdate(() => previewState);
  };

  const handleCommit = (startPoint, endIndex) => {
    if (!startPoint || typeof endIndex !== 'number') return;
    const endPoint = getCoordinates(endIndex);
    const rectanglePoints = drawRectangle(startPoint, endPoint);
    return rectanglePoints;
  };

  return {
    handlePreview,
    handleCommit,
    modeName: 'Rectangle Mode',
    isActive
  };
};

export default RectangleMode;