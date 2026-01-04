import React from 'react';

const getCoordinates = (index) => ({
  x: index % 128,
  y: Math.floor(index / 128)
});

const getIndex = (x, y) => y * 128 + x;

const drawLine = (start, end) => {
  const points = [];
  let x0 = start.x;
  let y0 = start.y;
  let x1 = end.x;
  let y1 = end.y;

  x0 = Math.max(0, Math.min(127, x0));
  y0 = Math.max(0, Math.min(63, y0));
  x1 = Math.max(0, Math.min(127, x1));
  y1 = Math.max(0, Math.min(63, y1));

  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);

  if (steep) {
    [x0, y0] = [y0, x0];
    [x1, y1] = [y1, x1];
  }

  if (x0 > x1) {
    [x0, x1] = [x1, x0];
    [y0, y1] = [y1, y0];
  }

  const dx = x1 - x0;
  const dy = Math.abs(y1 - y0);
  const yStep = y0 < y1 ? 1 : -1;
  
  let error = dx / 2;
  let y = y0;

  for (let x = x0; x <= x1; x++) {
    const currentX = steep ? y : x;
    const currentY = steep ? x : y;
    const index = getIndex(currentX, currentY);
    if (index >= 0 && index < 8192) {
      points.push(index);
    }
    error -= dy;
    if (error < 0) {
      y += yStep;
      error += dx;
    }
  }

  return points;
};

const LineMode = ({ isActive, onPixelUpdate, onPreviewUpdate, drawColor = true }) => {
  const updateLine = (startPoint, endPoint) => {
    if (!startPoint || !endPoint) return;
    const linePoints = drawLine(startPoint, endPoint);
    const newPreview = Array(8192).fill(false);
    linePoints.forEach(idx => {
      if (drawColor) {
        newPreview[idx] = true;
      } else {
        newPreview[idx] = 'black-preview';
      }
    });
    return newPreview;
  };

  const handlePreview = (startPoint, currentIndex) => {
    if (!startPoint || typeof currentIndex !== 'number') return;
    const currentPoint = getCoordinates(currentIndex);
    const previewState = updateLine(startPoint, currentPoint);
    onPreviewUpdate(() => previewState);
  };

  const handleCommit = (startPoint, endIndex) => {
    if (!startPoint || typeof endIndex !== 'number') return;
    const endPoint = getCoordinates(endIndex);
    const linePoints = drawLine(startPoint, endPoint);
    return linePoints;
  };

  return {
    handlePreview,
    handleCommit,
    modeName: 'Line Mode',
    isActive
  };
};

export default LineMode;