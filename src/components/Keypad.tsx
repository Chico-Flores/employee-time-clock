import React from 'react';

interface KeypadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const Keypad: React.FC<KeypadProps> = ({ onKeyPress, onBackspace, onClear }) => {
  return (
    <div className="keypad" role="group" aria-label="PIN keypad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
        <button type="button" className="keypad-key" key={key} onClick={() => onKeyPress(key)}>
          {key}
        </button>
      ))}
      <button type="button" className="keypad-key keypad-key-muted" onClick={onClear} aria-label="Clear PIN">
        C
      </button>
      <button type="button" className="keypad-key" onClick={() => onKeyPress('0')}>
        0
      </button>
      <button type="button" className="keypad-key keypad-key-muted" onClick={onBackspace} aria-label="Delete last digit">
        ⌫
      </button>
    </div>
  );
};

export default Keypad;
