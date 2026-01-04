import React, { useRef } from 'react';

const BMPHandler = ({ pixelData, onPixelUpdate }) => {
  const fileInputRef = useRef(null);
  
  const uploadBMP = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      parseBMP(buffer);
    };
    
    reader.readAsArrayBuffer(file);
  };
  
  const parseBMP = (buffer) => {
    const view = new DataView(buffer);
    
    if (view.getUint16(0, true) !== 0x4D42) {
      alert("Not a valid BMP file");
      return;
    }
    
    const width = view.getInt32(18, true);
    const height = view.getInt32(22, true);
    const bitsPerPixel = view.getUint16(28, true);
    
    if (width !== 128 || height !== 64 || (bitsPerPixel !== 1 && bitsPerPixel !== 24)) {
      alert(`Unsupported BMP format. Must be 128x64 pixels, found ${width}x${height}.`);
      return;
    }
    
    const offset = view.getUint32(10, true);
    const newPixels = Array(8192).fill(false);
    
    if (bitsPerPixel === 1) {
      for (let y = 0; y < 64; y++) {
        const row = 63 - y;
        for (let x = 0; x < 128; x++) {
          const byteIndex = offset + Math.floor((x + row * width) / 8);
          const bitIndex = 7 - (x % 8);
          const byte = view.getUint8(byteIndex);
          
          const isWhite = ((byte >> bitIndex) & 0x01) === 1;
          
          newPixels[y * 128 + x] = isWhite;
        }
      }
    } else if (bitsPerPixel === 24) {
      const rowSize = Math.floor((width * 3 + 3) & ~3);
      
      for (let y = 0; y < 64; y++) {
        const row = 63 - y;
        for (let x = 0; x < 128; x++) {
          const pixelOffset = offset + row * rowSize + x * 3;
          const blue = view.getUint8(pixelOffset);
          const green = view.getUint8(pixelOffset + 1);
          const red = view.getUint8(pixelOffset + 2);
          
          const brightness = (red + green + blue) / 3;
          const isWhite = brightness > 128;
          newPixels[y * 128 + x] = isWhite;
        }
      }
    }
    
    onPixelUpdate(() => newPixels);
  };
  
  const downloadBMP = () => {
    const fileSize = 62 + 128 * 64 / 8;
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    
    view.setUint16(0, 0x4D42, true);
    view.setUint32(2, fileSize, true);
    view.setUint32(10, 62, true);
    
    view.setUint32(14, 40, true);
    view.setInt32(18, 128, true);
    view.setInt32(22, 64, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 1, true);
    view.setUint32(30, 0, true);
    view.setUint32(34, 128 * 64 / 8, true);
    view.setInt32(38, 2835, true);
    view.setInt32(42, 2835, true);
    view.setUint32(46, 2, true);
    view.setUint32(50, 0, true);
    
    view.setUint32(54, 0x00000000, true);
    view.setUint32(58, 0x00FFFFFF, true);
    
    const dataOffset = 62;
    for (let y = 0; y < 64; y++) {
      const invY = 63 - y;
      for (let x = 0; x < 128; x += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const isWhite = pixelData[y * 128 + (x + bit)];
          if (isWhite) {
            byte |= (1 << (7 - bit));
          }
        }
        view.setUint8(dataOffset + Math.floor(x / 8) + invY * 16, byte);
      }
    }
    
    const blob = new Blob([buffer], { type: 'image/bmp' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pixel_art.bmp';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="bmp-handler">
      <button 
        onClick={() => fileInputRef.current.click()}
        className="file-button"
      >
        Import BMP
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".bmp"
        onChange={uploadBMP}
        style={{ display: 'none' }}
      />
      <button 
        onClick={downloadBMP}
        className="file-button"
      >
        Export BMP
      </button>
    </div>
  );
};

export default BMPHandler;