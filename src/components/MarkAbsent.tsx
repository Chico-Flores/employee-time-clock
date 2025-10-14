import React, { useState, useEffect } from 'react';

interface Employee {
  name: string;
  pin: string;
}

interface MarkAbsentProps {
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onMarkAbsentSuccess: () => void;
}

const MarkAbsent: React.FC<MarkAbsentProps> = ({ showMessageToUser, onMarkAbsentSuccess }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPin, setSelectedPin] = useState('');
  const [absentDate, setAbsentDate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch all employees
    fetch('/get-users', { method: 'POST' })
      .then((response) => response.json())
      .then((users) => {
        // Filter out admin users (those with username field)
        const employeeList = users
          .filter((user: any) => !user.username && user.pin && user.name)
          .map((user: any) => ({ name: user.name, pin: user.pin }))
          .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name));
        setEmployees(employeeList);
      })
      .catch((error) => {
        console.error('Error fetching employees:', error);
        showMessageToUser('Error loading employees', 'error');
      });

    // Set default date to today
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setAbsentDate(`${year}-${month}-${day}`);
  }, []);

  const handleMarkAbsent = async () => {
    if (!selectedPin) {
      showMessageToUser('Please select an employee', 'warning');
      return;
    }

    if (!absentDate) {
      showMessageToUser('Please select a date', 'warning');
      return;
    }

    const selectedEmployee = employees.find(emp => emp.pin === selectedPin);
    if (!selectedEmployee) {
      showMessageToUser('Employee not found', 'error');
      return;
    }

    // Format date as PST midnight
    const dateObj = new Date(absentDate + 'T00:00:00');
    const pstDate = dateObj.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    setLoading(true);

    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      const ip = ipData.ip;

      const response = await fetch('/mark-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: selectedPin,
          date: pstDate,
          ip: ip
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          // Duplicate absence
          showMessageToUser(data.error, 'warning');
        } else if (response.status === 400 && data.warning) {
          // Has existing records - show confirmation
          const confirmed = window.confirm(
            `⚠️ ${data.warning}\n\nDo you still want to mark them absent?`
          );
          
          if (confirmed) {
            // Retry with force flag
            const retryResponse = await fetch('/mark-absent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                pin: selectedPin,
                date: pstDate,
                ip: ip,
                force: true
              })
            });

            if (!retryResponse.ok) {
              const retryData = await retryResponse.json();
              throw new Error(retryData.error);
            }

            showMessageToUser(`${selectedEmployee.name} marked absent`, 'success');
            setSelectedPin('');
            onMarkAbsentSuccess();
          }
        } else {
          throw new Error(data.error || 'Failed to mark absent');
        }
      } else {
        showMessageToUser(`${selectedEmployee.name} marked absent for ${absentDate}`, 'success');
        setSelectedPin('');
        onMarkAbsentSuccess();
      }
    } catch (error: any) {
      console.error('Mark absent error:', error);
      showMessageToUser(`Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

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
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>📅 Mark Employee Absent</h2>
      <p style={{ color: '#666', marginBottom: '30px' }}>Report when employees call in sick or are absent for the day</p>

      <div style={{ display: 'grid', gap: '20px', marginBottom: '25px' }}>
        {/* Employee Selection */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#374151',
            fontSize: '15px'
          }}>
            Select Employee:
          </label>
          <select
            value={selectedPin}
            onChange={(e) => setSelectedPin(e.target.value)}
            style={{
              width: '100%',
              padding: '14px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '16px',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          >
            <option value="">-- Choose an employee --</option>
            {employees.map((emp) => (
              <option key={emp.pin} value={emp.pin}>
                {emp.name} ({emp.pin})
              </option>
            ))}
          </select>
        </div>

        {/* Date Selection */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#374151',
            fontSize: '15px'
          }}>
            Absence Date:
          </label>
          <input
            type="date"
            value={absentDate}
            onChange={(e) => setAbsentDate(e.target.value)}
            style={{
              width: '100%',
              padding: '14px',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '16px',
              backgroundColor: 'white',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
        </div>
      </div>

      {/* Action Button */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={handleMarkAbsent}
          disabled={loading || !selectedPin || !absentDate}
          style={{
            background: loading || !selectedPin || !absentDate
              ? '#9ca3af'
              : 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: 'white',
            padding: '14px 32px',
            border: 'none',
            borderRadius: '12px',
            cursor: loading || !selectedPin || !absentDate ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.3s ease',
            opacity: loading || !selectedPin || !absentDate ? 0.6 : 1
          }}
          onMouseOver={(e) => {
            if (!loading && selectedPin && absentDate) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseOut={(e) => {
            if (!loading && selectedPin && absentDate) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          {loading ? '⏳ Marking Absent...' : '❌ Mark Absent'}
        </button>

        <button
          onClick={() => {
            setSelectedPin('');
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            setAbsentDate(`${year}-${month}-${day}`);
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

      {/* Info Box */}
      <div style={{ 
        marginTop: '25px', 
        padding: '20px', 
        background: '#eff6ff', 
        borderRadius: '12px',
        border: '2px solid #bfdbfe'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#1e40af', fontSize: '15px' }}>💡 How it works:</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e40af', lineHeight: '1.8', fontSize: '14px' }}>
          <li>Mark employees absent for any date (today, past, or future)</li>
          <li>If employee already has records for that day, you'll be warned</li>
          <li>Employees marked absent can still clock in if they show up late</li>
          <li>Discord notification will alert the team via @everyone</li>
          <li>Absent records appear in Time Cards and CSV exports</li>
        </ul>
      </div>
    </div>
  );
};

export default MarkAbsent;
