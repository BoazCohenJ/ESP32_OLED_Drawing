export const getCoordinates = (index) => ({
  x: index % 128,
  y: Math.floor(index / 128)
});

export const getIndex = (x, y) => y * 128 + x;

export const drawLine = (start, end) => {
  const points = [];
  let x0 = start.x, y0 = start.y;
  let x1 = end.x, y1 = end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  
  let err = dx - dy;

  while (true) {
    points.push(y0 * 128 + x0);
    
    if (x0 === x1 && y0 === y1) break;
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
};