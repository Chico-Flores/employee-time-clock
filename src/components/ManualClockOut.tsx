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
  const [loading, setLoading] = useState<{ [pin: string]: boolean }>({});

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
    setLoading({ ...loading, [employee.pin]: true });
    
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
    } finally {
      setLoading({ ...loading, [employee.pin]: false });
    }
  };

  if (currentlyWorking.length === 0) {
    return (
      <div style={{ 
        background: 'white', 
        borderRadius: '20px', 
        padding: '3rem', 
        margin: '0 auto', 
        maxWidth: '1400px',
        width: '95%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '1rem', opacity: 0.3 }}>🏠</div>
        <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>🔧 Manual Clock Out</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>No employees are currently clocked in.</p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'white', 
      borderRadius: '20px', 
      padding: '2rem', 
      margin: '0 auto', 
      maxWidth: '1400px',
      width: '95%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' 
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>🔧 Manual Clock Out</h2>
        <p style={{ color: '#6b7280', marginBottom: '8px' }}>
          Clock out employees who forgot or were sent home early
        </p>
        <p style={{ color: '#059669', fontWeight: '600', fontSize: '0.95rem' }}>
          {currentlyWorking.length} {currentlyWorking.length === 1 ? 'employee' : 'employees'} currently working
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: '20px' 
      }}>
        {currentlyWorking.map((employee) => (
          <div key={employee.pin} style={{
            border: '2px solid #e5e7eb',
            borderRadius: '16px',
            padding: '24px',
            background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
            transition: 'all 0.3s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}>
            {/* Status Badge */}
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
            }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: 'white',
                animation: 'pulse 2s ease-in-out infinite'
              }}></span>
              WORKING
            </div>

            {/* Employee Info */}
            <div style={{ marginBottom: '16px', paddingRight: '100px' }}>
              <h3 style={{ 
                margin: '0 0 8px 0', 
                color: '#1e3a8a', 
                fontSize: '1.3rem',
                fontWeight: '700'
              }}>
                {employee.name}
              </h3>
              <p style={{ 
                margin: 0, 
                color: '#6b7280', 
                fontSize: '0.9rem',
                fontWeight: '600'
              }}>
                PIN: {employee.pin}
              </p>
            </div>

            {/* Time Info */}
            <div style={{ 
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {employee.lastAction === 'ClockIn' ? 'Clocked In' : 'Last Action'}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#374151' }}>
                    {new Date(employee.lastActionTime).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: '600', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Duration
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#059669' }}>
                    ⏱️ {calculateDuration(employee.lastActionTime)}
                  </div>
                </div>
              </div>
            </div>

            {/* Note Input */}
            <textarea
              placeholder="Optional note (e.g., 'Sent home early', 'Forgot to clock out')..."
              value={notes[employee.pin] || ''}
              onChange={(e) => handleNoteChange(employee.pin, e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: '80px',
                marginBottom: '12px',
                transition: 'all 0.2s ease'
              }}
              maxLength={200}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
            
            <div style={{ 
              fontSize: '12px', 
              color: '#9ca3af',
              marginBottom: '12px',
              textAlign: 'right'
            }}>
              {notes[employee.pin]?.length || 0}/200
            </div>

            {/* Clock Out Button */}
            <button
              onClick={() => handleClockOut(employee)}
              disabled={loading[employee.pin]}
              style={{
                width: '100%',
                background: loading[employee.pin] 
                  ? '#9ca3af' 
                  : 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                padding: '14px',
                border: 'none',
                borderRadius: '10px',
                cursor: loading[employee.pin] ? 'not-allowed' : 'pointer',
                fontSize: '15px',
                fontWeight: '700',
                boxShadow: loading[employee.pin] ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)',
                transition: 'all 0.3s ease',
                opacity: loading[employee.pin] ? 0.6 : 1
              }}
              onMouseOver={(e) => {
                if (!loading[employee.pin]) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading[employee.pin]) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading[employee.pin] ? '⏳ Clocking Out...' : '🔴 Clock Out Now'}
            </button>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div style={{ 
        marginTop: '24px', 
        padding: '20px', 
        background: '#eff6ff', 
        borderRadius: '12px',
        border: '2px solid #bfdbfe'
      }}>
        <p style={{ margin: 0, color: '#1e40af', fontSize: '14px', lineHeight: '1.6' }}>
          <strong>💡 Tip:</strong> Notes are optional but recommended for record-keeping. This view auto-refreshes every 30 seconds.
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};

export default ManualClockOut;
