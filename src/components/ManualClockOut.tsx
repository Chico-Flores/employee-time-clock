import React, { useState, useEffect } from 'react';

interface Employee {
  name: string;
  pin: string;
  lastAction: string;
  lastActionTime: string;
}

interface ManualClockOutProps {
  records: any[];
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onClockOutSuccess: () => void;
}

const ManualClockOut: React.FC<ManualClockOutProps> = ({ records, showMessageToUser, onClockOutSuccess }) => {
  const [currentlyWorking, setCurrentlyWorking] = useState<Employee[]>([]);
  const [notes, setNotes] = useState<{ [pin: string]: string }>({});

  useEffect(() => {
    updateCurrentlyWorking();
    // Auto-refresh every 30 seconds
    const interval = setInterval(updateCurrentlyWorking, 30000);
    return () => clearInterval(interval);
  }, [records]);

  const updateCurrentlyWorking = () => {
    // Group records by PIN
    const recordsByPin: { [pin: string]: any[] } = {};
    records.forEach(record => {
      if (!recordsByPin[record.pin]) {
        recordsByPin[record.pin] = [];
      }
      recordsByPin[record.pin].push(record);
    });

    // Find employees currently working
    const working: Employee[] = [];
    Object.keys(recordsByPin).forEach(pin => {
      const empRecords = recordsByPin[pin];
      // Sort by time (most recent first)
      empRecords.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const lastRecord = empRecords[0];
      
      // Check if last action means they're currently working
      const workingActions = ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'];
      if (workingActions.includes(lastRecord.action)) {
        working.push({
          name: lastRecord.name,
          pin: lastRecord.pin,
          lastAction: lastRecord.action,
          lastActionTime: lastRecord.time
        });
      }
    });

    setCurrentlyWorking(working);
  };

  const calculateDuration = (startTime: string): string => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const handleNoteChange = (pin: string, value: string) => {
    if (value.length <= 200) {
      setNotes({ ...notes, [pin]: value });
    }
  };

  const handleClockOut = async (employee: Employee) => {
    try {
      // Get PST time
      const date = new Date();
      const currentTime = date.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      
      // Get IP first
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      const ip = ipData.ip;

      // Then make the clock-out request
      const response = await fetch('/manual-clock-out', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pin: employee.pin,
          time: currentTime,
          ip: ip,
          note: notes[employee.pin] || ''
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Clock out failed');
      }

      showMessageToUser(`${employee.name} clocked out successfully`, 'success');
      setNotes({ ...notes, [employee.pin]: '' }); // Clear note
      onClockOutSuccess(); // Refresh records
    } catch (error: any) {
      console.error('Clock out error:', error);
      showMessageToUser(`Error clocking out: ${error.message}`, 'error');
    }
  };

  if (currentlyWorking.length === 0) {
    return (
      <div style={{ 
        background: 'white', 
        borderRadius: '20px', 
        padding: '2rem', 
        margin: '2rem auto', 
        maxWidth: '1400px', 
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' 
      }}>
        <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>🔧 Manual Clock Out</h2>
        <p style={{ color: '#666' }}>No employees are currently clocked in.</p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'white', 
      borderRadius: '20px', 
      padding: '2rem', 
      margin: '2rem auto', 
      maxWidth: '1400px', 
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' 
    }}>
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>🔧 Manual Clock Out</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>Clock out employees who forgot or were sent home early</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {currentlyWorking.map((employee) => (
          <div key={employee.pin} style={{
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            background: '#f9fafb'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
              <div style={{ flex: '1', minWidth: '250px' }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#1e3a8a', fontSize: '1.2rem' }}>
                  {employee.name} <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>({employee.pin})</span>
                </h3>
                <p style={{ margin: '0 0 5px 0', color: '#374151', fontSize: '0.95rem' }}>
                  <strong>{employee.lastAction === 'ClockIn' ? 'Clocked in' : 'Returned to work'}</strong> at {employee.lastActionTime}
                </p>
                <p style={{ margin: 0, color: '#059669', fontWeight: '600', fontSize: '1rem' }}>
                  ⏱️ Duration: {calculateDuration(employee.lastActionTime)}
                </p>
              </div>

              <div style={{ flex: '2', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Optional note (e.g., 'Sent home early', 'Forgot to clock out')..."
                  value={notes[employee.pin] || ''}
                  onChange={(e) => handleNoteChange(employee.pin, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  maxLength={200}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {notes[employee.pin]?.length || 0}/200 characters
                  </span>
                  <button
                    onClick={() => handleClockOut(employee)}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: 'white',
                      padding: '10px 24px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    🔴 Clock Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        background: '#eff6ff', 
        borderRadius: '8px',
        border: '1px solid #bfdbfe'
      }}>
        <p style={{ margin: 0, color: '#1e40af', fontSize: '14px' }}>
          💡 <strong>Tip:</strong> Notes are optional but recommended for record-keeping. Auto-refreshes every 30 seconds.
        </p>
      </div>
    </div>
  );
};

export default ManualClockOut;
