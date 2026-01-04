import React, { useEffect } from 'react';

const ResetButton = ({ onReset }) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isInputField = event.target.tagName === 'INPUT' || 
                          event.target.tagName === 'TEXTAREA' ||
                          event.target.isContentEditable;
      
      if (event.key === 'Backspace' && !isInputField) {
        event.preventDefault();
        onReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onReset]);

  return (
    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={onReset}
        style={{
          padding: '5px 10px',
          backgroundColor: '#ff4444',
          color: 'white',
          border: '1px solid #cc0000',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Reset Grid
      </button>
    </div>
  );
};

export default ResetButton;