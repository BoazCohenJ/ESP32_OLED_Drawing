import React from 'react';
import PixelGrid from './components/pixelGrid';

const App = () => {
  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center'
    }}>
      <PixelGrid />
    </div>
  );
};

export default App;