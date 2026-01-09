import React from 'react';

const BucketFillMode = ({ isActive, onPixelUpdate, drawColor = true }) => {
  const handleFill = (index, pixels) => {
    const targetColor = pixels[index];
    
    if (targetColor === drawColor) return;
    
    const newPixels = [...pixels];
    const width = 128;
    const height = 64;
    
    if (drawColor === true) {
      const stack = [index];
      
      while (stack.length > 0) {
        const currentIndex = stack.pop();
        
        if (newPixels[currentIndex] === targetColor) {
          newPixels[currentIndex] = drawColor;
          
          const x = currentIndex % width;
          const y = Math.floor(currentIndex / width);
          
          if (x > 0 && newPixels[getIndex(x-1, y)] === targetColor) {
            stack.push(getIndex(x-1, y));
          }
          if (x < width - 1 && newPixels[getIndex(x+1, y)] === targetColor) {
            stack.push(getIndex(x+1, y));
          }
          if (y > 0 && newPixels[getIndex(x, y-1)] === targetColor) {
            stack.push(getIndex(x, y-1));
          }
          if (y < height - 1 && newPixels[getIndex(x, y+1)] === targetColor) {
            stack.push(getIndex(x, y+1));
          }
        }
      }
    } else {
      const stack = [index];
      const filledIndices = new Set();
      
      while (stack.length > 0) {
        const currentIndex = stack.pop();
        
        if (newPixels[currentIndex] === targetColor && !filledIndices.has(currentIndex)) {
          filledIndices.add(currentIndex);
          
          const x = currentIndex % width;
          const y = Math.floor(currentIndex / width);
          
          if (x > 0 && newPixels[getIndex(x-1, y)] === targetColor) {
            stack.push(getIndex(x-1, y));
          }
          if (x < width - 1 && newPixels[getIndex(x+1, y)] === targetColor) {
            stack.push(getIndex(x+1, y));
          }
          if (y > 0 && newPixels[getIndex(x, y-1)] === targetColor) {
            stack.push(getIndex(x, y-1));
          }
          if (y < height - 1 && newPixels[getIndex(x, y+1)] === targetColor) {
            stack.push(getIndex(x, y+1));
          }
        }
      }
      
      for (const idx of filledIndices) {
        const x = idx % width;
        const y = Math.floor(idx / width);
        
        const hasNonMatchingNeighbor = 
            (x > 0 && !filledIndices.has(getIndex(x-1, y)) && newPixels[getIndex(x-1, y)] !== targetColor) || 
            (x < width - 1 && !filledIndices.has(getIndex(x+1, y)) && newPixels[getIndex(x+1, y)] !== targetColor) ||
            (y > 0 && !filledIndices.has(getIndex(x, y-1)) && newPixels[getIndex(x, y-1)] !== targetColor) ||
            (y < height - 1 && !filledIndices.has(getIndex(x, y+1)) && newPixels[getIndex(x, y+1)] !== targetColor);
            
        if (!hasNonMatchingNeighbor) {
          newPixels[idx] = drawColor;
        }
      }
    }
    
    onPixelUpdate(() => newPixels);
  };
  
  const getIndex = (x, y) => y * 128 + x;
  
  return {
    handleFill,
    modeName: 'Bucket Fill',
    isActive
  };
};

export default BucketFillMode;  