import React, { useState } from 'react';

interface AddEmployeeProps {
  onAddSuccess: () => void;
  onCloseOverlay: () => void;
  inline?: boolean; // New prop to determine if it's inline or popup
}

const AddEmployee: React.FC<AddEmployeeProps> = ({ onAddSuccess, onCloseOverlay, inline = false }) => {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const MIN_NAME_LENGTH = 2;
  const PIN_LENGTH = 4;

  const handleAddEmployee = async () => {
    if (name.length < MIN_NAME_LENGTH) {
      setError(`Name must be at least ${MIN_NAME_LENGTH} characters long`);
      return;
    }

    if (pin.length !== PIN_LENGTH) {
      setError(`PIN must be exactly ${PIN_LENGTH} digits long`);
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must contain only numbers');
      return;
    }

    fetch('/add-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin })
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.id) {
          setName('');
          setPin('');
          setError('');
          onAddSuccess();
        } else {
          setError('Error adding employee: ' + data.error);
        }
      })
      .catch((error) => setError('Error adding employee: ' + error));
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= PIN_LENGTH) {
      setPin(value);
    }
  };

  // Inline version (for tabs)
  if (inline) {
    return (
      <div style={{ 
        background: 'white', 
        borderRadius: '20px', 
        padding: '2rem', 
        margin: '2rem auto', 
        maxWidth: '1400px',
        width: '95%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' 
      }}>
        <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>➕ Add Employee</h2>
        <p style={{ color: '#666', marginBottom: '30px' }}>Add a new employee to the time clock system</p>

        <div style={{ display: 'grid', gap: '20px', marginBottom: '25px', maxWidth: '600px' }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              color: '#374151',
              fontSize: '15px'
            }}>
              Employee Name:
            </label>
            <input
              type="text"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '16px',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              color: '#374151',
              fontSize: '15px'
            }}>
              4-Digit PIN:
            </label>
            <input
              type="text"
              placeholder="Enter 4-digit PIN"
              value={pin}
              onChange={handlePinChange}
              maxLength={PIN_LENGTH}
              inputMode="numeric"
              pattern="[0-9]{4}"
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '16px',
                letterSpacing: '0.5em',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: '600',
            borderLeft: '4px solid #ef4444',
            maxWidth: '600px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', maxWidth: '600px' }}>
          <button
            onClick={handleAddEmployee}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              padding: '14px 32px',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #059669, #047857)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ➕ Add Employee
          </button>

          <button
            onClick={() => {
              setName('');
              setPin('');
              setError('');
            }}
            style={{
              background: '#f3f4f6',
              color: '#374151',
              padding: '14px 24px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#e5e7eb';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  // Popup version (original)
  return (
    <div className="employee-overlay">
      <div className="employee-container">
        <button className="close-btn" onClick={onCloseOverlay}>X</button>
        <h1>Add an Employee</h1>
        <div>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <input
            type="text"
            placeholder="PIN (4 digits)"
            value={pin}
            onChange={handlePinChange}
            maxLength={PIN_LENGTH}
            inputMode="numeric"
            pattern="[0-9]{4}"
          />
        </div>
        {error && <div className="employee-error">{error}</div>}
        <button id="addEmployee" onClick={handleAddEmployee}>Add Employee</button>
      </div>
    </div>
  );
};

export default AddEmployee;
