import React from 'react';

const getCoordinates = (index) => ({
  x: index % 128,
  y: Math.floor(index / 128)
});

const getIndex = (x, y) => y * 128 + x;

const drawCircle = (center, point) => {
  const points = [];
  const radius = Math.floor(Math.sqrt(
    Math.pow(point.x - center.x, 2) + 
    Math.pow(point.y - center.y, 2)
  ));

  const actualCenter = center;

  let x = radius;
  let y = 0;
  let error = 0;

  while (x >= y) {
    const coordinates = [
      [actualCenter.x + x, actualCenter.y + y],
      [actualCenter.x + y, actualCenter.y + x],
      [actualCenter.x - y, actualCenter.y + x],
      [actualCenter.x - x, actualCenter.y + y],
      [actualCenter.x - x, actualCenter.y - y],
      [actualCenter.x - y, actualCenter.y - x],
      [actualCenter.x + y, actualCenter.y - x],
      [actualCenter.x + x, actualCenter.y - y],
    ];

    coordinates.forEach(([px, py]) => {
      if (px >= 0 && px < 128 && py >= 0 && py < 64) {
        const index = getIndex(px, py);
        if (index >= 0 && index < 8192) {
          points.push(index);
        }
      }
    });

    y++;
    error += 1 + 2 * y;
    if (2 * (error - x) + 1 > 0) {
      x--;
      error += 1 - 2 * x;
    }
  }

  return points;
};

const CircleMode = ({ isActive, onPixelUpdate, onPreviewUpdate, drawColor = true }) => {
  const updateCircle = (centerPoint, currentPoint) => {
    if (!centerPoint || !currentPoint) return;
    const circlePoints = drawCircle(centerPoint, currentPoint);
    const newPreview = Array(8192).fill(false);
    circlePoints.forEach(idx => {
      newPreview[idx] = drawColor ? true : 'black-preview';
    });
    return newPreview;
  };

  const handlePreview = (centerPoint, currentIndex) => {
    if (!centerPoint || typeof currentIndex !== 'number') return;
    const currentPoint = getCoordinates(currentIndex);
    const previewState = updateCircle(centerPoint, currentPoint);
    onPreviewUpdate(() => previewState);
  };

  const handleCommit = (centerPoint, endIndex) => {
    if (!centerPoint || typeof endIndex !== 'number') return;
    const endPoint = getCoordinates(endIndex);
    const circlePoints = drawCircle(centerPoint, endPoint);
    return circlePoints;
  };

  return {
    handlePreview,
    handleCommit,
    modeName: 'Circle Mode',
    isActive
  };
};

export default CircleMode;