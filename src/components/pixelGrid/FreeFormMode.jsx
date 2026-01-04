import React from 'react';
import { getCoordinates, drawLine } from './utils';

const FreeformMode = ({ isActive, onPixelUpdate, brushSize, drawColor = true }) => {
  const handleDraw = (lastPoint, currentIndex) => {
    const currentPoint = getCoordinates(currentIndex);
    if (lastPoint) {
      const pointsToDraw = [];
      drawLine(lastPoint, currentPoint).forEach(idx => {
        pointsToDraw.push(idx);
        const centerX = idx % 128;
        const centerY = Math.floor(idx / 128);
        for (let offset = 0; offset < brushSize; offset++) {
          for (let i = -offset; i <= offset; i++) {
            const points = [
              { x: centerX + i, y: centerY - (brushSize - 1 - offset) },
              { x: centerX + i, y: centerY + (brushSize - 1 - offset) },
              { x: centerX - (brushSize - 1 - offset), y: centerY + i },
              { x: centerX + (brushSize - 1 - offset), y: centerY + i }
            ];
            points.forEach(point => {
              if (point.x >= 0 && point.x < 128 && point.y >= 0 && point.y < 64) {
                const newIdx = point.y * 128 + point.x;
                if (newIdx >= 0 && newIdx < 8192) {
                  pointsToDraw.push(newIdx);
                }
              }
            });
          }
        }
      });

      onPixelUpdate(prev => {
        const newPixels = [...prev];
        pointsToDraw.forEach(idx => {
          if (idx >= 0 && idx < 8192) {
            newPixels[idx] = drawColor;
          }
        });
        return newPixels;
      });
    }
    return currentPoint;
  };

  const handleStart = (index) => {
    const pointsToDraw = [];
    const centerX = index % 128;
    const centerY = Math.floor(index / 128);
    for (let offset = 0; offset < brushSize; offset++) {
      for (let i = -offset; i <= offset; i++) {
        const points = [
          { x: centerX + i, y: centerY - (brushSize - 1 - offset) },
          { x: centerX + i, y: centerY + (brushSize - 1 - offset) },
          { x: centerX - (brushSize - 1 - offset), y: centerY + i },
          { x: centerX + (brushSize - 1 - offset), y: centerY + i }
        ];
        points.forEach(point => {
          if (point.x >= 0 && point.x < 128 && point.y >= 0 && point.y < 64) {
            const newIdx = point.y * 128 + point.x;
            if (newIdx >= 0 && newIdx < 8192) {
              pointsToDraw.push(newIdx);
            }
          }
        });
      }
    }

    onPixelUpdate(prev => {
      const newPixels = [...prev];
      pointsToDraw.forEach(idx => {
        if (idx >= 0 && idx < 8192) {
          newPixels[idx] = drawColor;
        }
      });
      return newPixels;
    });
  };

  return {
    handleDraw,
    handleStart,
    modeName: 'Freeform Mode',
    isActive
  };
};

export default FreeformMode;