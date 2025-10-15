import React, { useState } from 'react';

interface Employee {
  name: string;
  pin: string;
  lastAction: string;
  lastActionTime: string;
}

interface BulkClockOutProps {
  currentlyWorking: Employee[];
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBulkClockOutSuccess: () => void;
}

const BulkClockOut: React.FC<BulkClockOutProps> = ({ 
  currentlyWorking, 
  showMessageToUser, 
  onBulkClockOutSuccess 
}) => {
  const [loading, setLoading] = useState(false);

  const handleBulkClockOut = async () => {
    if (currentlyWorking.length === 0) {
      showMessageToUser('No employees are currently clocked in', 'warning');
      return;
    }

    // Show confirmation dialog
    const employeeNames = currentlyWorking.map(emp => emp.name).join('\n');
    const confirmed = window.confirm(
      `⚠️ BULK CLOCK OUT\n\n` +
      `This will clock out ${currentlyWorking.length} employee(s):\n\n` +
      `${employeeNames}\n\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmed) return;

    setLoading(true);

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

      // Get IP
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      const ip = ipData.ip;

      // Clock out each employee
      const clockOutPromises = currentlyWorking.map(employee => 
        fetch('/manual-clock-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin: employee.pin,
            time: currentTime,
            ip: ip,
            note: 'Bulk clock-out by admin'
          })
        })
      );

      const results = await Promise.all(clockOutPromises);
      
      // Check for any failures
      const failures = results.filter(r => !r.ok);
      
      if (failures.length > 0) {
        showMessageToUser(
          `${currentlyWorking.length - failures.length} clocked out successfully, ${failures.length} failed`, 
          'warning'
        );
      } else {
        showMessageToUser(
          `Successfully clocked out ${currentlyWorking.length} employee(s)`, 
          'success'
        );
      }

      onBulkClockOutSuccess();
    } catch (error: any) {
      console.error('Bulk clock-out error:', error);
      showMessageToUser(`Error during bulk clock-out: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (currentlyWorking.length === 0) {
    return null; // Don't show button if no one is working
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      border: '2px solid #fbbf24',
      boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h3 style={{
            margin: '0 0 8px 0',
            color: '#92400e',
            fontSize: '1.2rem',
            fontWeight: '700'
          }}>
            ⚡ Bulk Actions
          </h3>
          <p style={{
            margin: 0,
            color: '#92400e',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Clock out all {currentlyWorking.length} working employee{currentlyWorking.length !== 1 ? 's' : ''} at once
          </p>
        </div>

        <button
          onClick={handleBulkClockOut}
          disabled={loading}
          style={{
            background: loading 
              ? '#9ca3af' 
              : 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white',
            padding: '14px 28px',
            border: 'none',
            borderRadius: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '700',
            boxShadow: loading ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.4)',
            transition: 'all 0.3s ease',
            opacity: loading ? 0.6 : 1,
            whiteSpace: 'nowrap'
          }}
          onMouseOver={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.5)';
            }
          }}
          onMouseOut={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
            }
          }}
        >
          {loading ? '⏳ Clocking Out All...' : '🔴 Clock Out All'}
        </button>
      </div>
    </div>
  );
};

export default BulkClockOut;
