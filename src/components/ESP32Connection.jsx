import React, { useState, useEffect, useRef } from 'react';

const ESP32Connection = ({ pixelData }) => {
  const [ipAddress, setIpAddress] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [showSettings, setShowSettings] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const previousPixelDataRef = useRef(null);
  const updateIntervalRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (autoUpdate && ipAddress) {
      updateIntervalRef.current = setInterval(() => {
        if (!previousPixelDataRef.current || 
            !arraysEqual(pixelData, previousPixelDataRef.current)) {
          sendToESP32(false);
          previousPixelDataRef.current = [...pixelData];
        }
      }, 100);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      };
    } else if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }
  }, [autoUpdate, ipAddress, pixelData]);
  
  const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };
  
  const convertToRLE = (pixels) => {
    const rle = [];
    let currentValue = pixels[0] === true;
    let count = 1;
    
    for (let i = 1; i < pixels.length; i++) {
      if (pixels[i] === currentValue) {
        count++;
      } else {
        rle.push({ value: currentValue, count });
        currentValue = pixels[i] === true;
        count = 1;
      }
    }
    
    rle.push({ value: currentValue, count });
    return rle;
  };
  
  const testConnection = async () => {
    if (!ipAddress) return false;
    
    try {
      setConnectionStatus('Testing connection...');
      const response = await fetch(`http://${ipAddress}/ping`, { cache: 'no-store' });
      
      if (response.ok) {
        setConnectionStatus('Connected');
        setIsConnected(true);
        return true;
      } else {
        setConnectionStatus('Connection failed');
        setIsConnected(false);
        return false;
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      setConnectionStatus('Connection failed');
      setIsConnected(false);
      return false;
    }
  };
  
  const sendToESP32 = async (updateStatus = true) => {
    if (!ipAddress) {
      if (updateStatus) alert('Please enter ESP32 IP address');
      return;
    }
    
    try {
      if (updateStatus) setConnectionStatus('Sending data...');
      
      let dataToSend;
      const whitePixelCount = pixelData.filter(p => p === true).length;
      
      if (whitePixelCount < 100) {
        dataToSend = {
          pixels: pixelData.map((val, idx) => val === true ? idx : -1).filter(idx => idx !== -1)
        };
      } else {
        dataToSend = {
          data: convertToRLE(pixelData)
        };
      }
      
      const response = await fetch(`http://${ipAddress}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
        cache: 'no-store'
      });
      
      if (response.ok) {
        if (updateStatus) setConnectionStatus('Connected');
        setIsConnected(true);
      } else {
        if (updateStatus) setConnectionStatus('Update failed');
        setIsConnected(false);
      }
    } catch (error) {
      console.error('ESP32 connection error:', error);
      if (updateStatus) setConnectionStatus('Error: ' + error.message);
      setIsConnected(false);
    }
  };
  
  return (
    <div className="esp32-connection">
      <button 
        className="esp-button"
        onClick={() => setShowSettings(!showSettings)}
        style={{ 
          position: 'relative',
          backgroundColor: isConnected ? 
            (autoUpdate ? '#4CAF50' : '#2196F3') : '#555'
        }}
      >
        ESP32 OLED
        {autoUpdate && (
          <span style={{ 
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            backgroundColor: '#ff4444',
            color: 'white',
            borderRadius: '50%',
            width: '10px',
            height: '10px'
          }}></span>
        )}
      </button>
      
      {showSettings && (
        <div className="esp-settings">
          <div>
            <input
              type="text"
              placeholder="ESP32 IP Address"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
            />
            <button 
              onClick={() => sendToESP32(true)}
              disabled={!ipAddress}
            >
              Send to OLED
            </button>
          </div>
          
          <div style={{ 
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center'
          }}>
            <input 
              type="checkbox" 
              id="autoUpdate" 
              checked={autoUpdate}
              onChange={(e) => setAutoUpdate(e.target.checked)}
              style={{ marginRight: '5px' }}
              disabled={!isConnected}
            />
            <label htmlFor="autoUpdate" style={{ color: '#ccc', fontSize: '14px' }}>
              Auto-update (10 FPS)
            </label>
          </div>
          
          <div className="status" style={{ 
            color: isConnected ? '#4CAF50' : '#ff6b6b'
          }}>
            Status: {connectionStatus}
          </div>
          
          <div style={{ marginTop: '10px' }}>
            <button 
              onClick={testConnection}
              style={{ 
                fontSize: '12px', 
                padding: '4px 8px', 
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                borderRadius: '4px'
              }}
              disabled={!ipAddress}
            >
              Test Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ESP32Connection;