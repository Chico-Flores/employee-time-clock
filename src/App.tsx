import React, { useState, useEffect, useRef } from 'react';
import Keypad from './components/Keypad';
import CreateAdmin from './components/CreateAdmin';
import AddEmployee from './components/AddEmployee';
import Login from './components/Login';
import DashboardStats from './components/DashboardStats';
import AdminTabs from './components/AdminTabs';
import PWAInstaller from './components/PWAInstaller';
import './assets/css/styles.css';

// Helper function to format employee status for display
const formatStatusDisplay = (status: string): { text: string; emoji: string } => {
  const statusMap: { [key: string]: { text: string; emoji: string } } = {
    'clockIn': { text: 'Clocked In & Working', emoji: '🟢' },
    'endBreak': { text: 'Clocked In & Working', emoji: '🟢' },
    'endRestroom': { text: 'Clocked In & Working', emoji: '🟢' },
    'endLunch': { text: 'Clocked In & Working', emoji: '🟢' },
    'endItIssue': { text: 'Clocked In & Working', emoji: '🟢' },
    'endMeeting': { text: 'Clocked In & Working', emoji: '🟢' },
    'startBreak': { text: 'On Break', emoji: '☕' },
    'startLunch': { text: 'On Lunch', emoji: '🍔' },
    'startRestroom': { text: 'Restroom Break', emoji: '🚻' },
    'startItIssue': { text: 'Having IT Issues', emoji: '💻' },
    'startMeeting': { text: 'In a Meeting', emoji: '📊' },
    'clockOut': { text: 'Clocked Out', emoji: '🔴' }
  };

  return statusMap[status] || { text: status, emoji: '⚪' };
};

const App: React.FC = () => {
  const timeClockContainerRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [rememberPin, setRememberPin] = useState(false);
  const [timeCardRecords, setTimeCardRecords] = useState<{ id: number; name: string; pin: string; action: string; time: string; ip: string; admin_action?: boolean; note?: string }[]>([]);
  const [employeeStatus, setEmployeeStatus] = useState<{ [pin: string]: string }>({});
  const isOverlayShowing = showCreateAdmin || showLogin || showAddEmployee;
  const [lastInteractionTime, setLastInteractionTime] = useState(new Date());

  // Function to get PST time
  const getPSTTime = () => {
    const date = new Date();
    return date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  useEffect(() => {
    // Update clock to PST every second
    const updateTime = () => setCurrentTime(getPSTTime());
    updateTime(); // Initial call
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load saved PIN on mount
  useEffect(() => {
    const savedPin = localStorage.getItem('rememberedPin');
    if (savedPin) {
      setPin(savedPin);
      setRememberPin(true);
    }
  }, []);

  useEffect(() => {
    fetch('/is-logged-in')
      .then((response) => response.json())
      .then((data) => {
        setIsLoggedIn(data.isLoggedIn);
        if (!data.isLoggedIn) {
          fetch('/get-users', { method: 'POST' })
            .then((response) => response.json())
            .then((users) => {
              if (users.length === 0) {
                setShowCreateAdmin(true);
              } else {
                fetch('/get-records', { method: 'POST' })
                  .then((response) => response.json())
                  .then((records) => {
                    setShowLoginButton(true);
                    setTimeCardRecords(records);
                  })
                  .catch((error) => console.error('Error checking records:', error));
              }
            })
        } else {
          // If already logged in, fetch records immediately
          fetch('/get-records', { method: 'POST' })
            .then((response) => response.json())
            .then((records) => setTimeCardRecords(records))
            .catch((error) => console.error('Error loading records:', error));
        }
      })
      .catch((error) => console.error('Error checking login status:', error));
  }, [setIsLoggedIn, setTimeCardRecords]);

  // Load employee status from existing records
  useEffect(() => {
    if (timeCardRecords.length > 0) {
      const statusMap: { [pin: string]: string } = {};
      
      const recordsByPin: { [pin: string]: typeof timeCardRecords } = {};
      timeCardRecords.forEach(record => {
        if (!recordsByPin[record.pin]) {
          recordsByPin[record.pin] = [];
        }
        recordsByPin[record.pin].push(record);
      });
      
      Object.keys(recordsByPin).forEach(pin => {
        const records = recordsByPin[pin];
        records.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const lastRecord = records[records.length - 1];
        
        const action = lastRecord.action.charAt(0).toLowerCase() + lastRecord.action.slice(1);
        statusMap[pin] = action;
      });
      
      setEmployeeStatus(statusMap);
    }
  }, [timeCardRecords]);

  useEffect(() => {
    if (!showCreateAdmin && !showLogin) {
      timeClockContainerRef.current?.focus();
    }
  }, [showCreateAdmin, showLogin]);

  const handleInteraction = () => {
    setLastInteractionTime(new Date());
  };

  useEffect(() => {
    const logout = () => {
      fetch('/logout').then(() => {
        setShowLoginButton(true);
        window.location.reload();
      });
    };

    const logoutTimer = setTimeout(() => {
      const now = new Date();
      const timeDiff = now.getTime() - lastInteractionTime.getTime();
      if (timeDiff >= 30 * 60 * 1000) {
        logout();
      }
    }, 30 * 60 * 1000);

    window.addEventListener('mousemove', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('click', handleInteraction);

    return () => {
      clearTimeout(logoutTimer);
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('click', handleInteraction);
    };
  }, [lastInteractionTime]);

  // Auto-refresh records every 30 seconds when logged in
  useEffect(() => {
    if (isLoggedIn) {
      const interval = setInterval(() => {
        fetch('/get-records', { method: 'POST' })
          .then((response) => response.json())
          .then((records) => setTimeCardRecords(records))
          .catch((error) => console.error('Error refreshing records:', error));
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  const handleKeyPress = (key: string) => {
    if (pin.length < 4 && key.trim() !== '' && !isNaN(Number(key))) {
      setPin(pin + key);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isNaN(Number(e.key)) && !isOverlayShowing) {
      handleKeyPress(e.key);
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      handleBackspace();
    }
    if (e.key === 'Enter' && isOverlayShowing) {
      if (showLogin) {
        let loginButton = document.getElementById('login');
        loginButton?.click();
      }
      if (showCreateAdmin) {
        let createAdminButton = document.getElementById('createAdmin');
        createAdminButton?.click();
      }
      if (showAddEmployee) {
        let addEmployeeButton = document.getElementById('addEmployee');
        addEmployeeButton?.click();
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
    setRememberPin(false);
    localStorage.removeItem('rememberedPin');
  };

  const handleActionClick = async (selectedAction: string) => {
    if (pin === '') {
      document.body.scrollTo(0, 0);
      let currentPin = document.getElementById('currentPin');
      if (currentPin) {
        currentPin.style.borderColor = '#ef4444';
        setTimeout(() => { currentPin.style.borderColor = '#e5e7eb'; }, 250);
        setTimeout(() => { currentPin.style.borderColor = '#ef4444'; }, 500);
        setTimeout(() => { currentPin.style.borderColor = '#e5e7eb'; }, 750);
      }
      return;
    }

    // Clock-in time restrictions and late detection (6:50 AM - 4:00 PM PST)
    if (selectedAction === 'clockIn') {
      const now = new Date();
      const pstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const hours = pstTime.getHours();
      const minutes = pstTime.getMinutes();
      const currentMinutes = hours * 60 + minutes; // Convert to total minutes since midnight
      
      const earliestClockIn = 6 * 60 + 50; // 6:50 AM in minutes (410)
      const latestClockIn = 16 * 60; // 4:00 PM in minutes (960)
      const lateThreshold = 7 * 60 + 10; // 7:10 AM in minutes (430)
      
      if (currentMinutes < earliestClockIn) {
        showMessageToUser('❌ Clock-in not allowed before 6:50 AM PST', 'error');
        return;
      }
      
      if (currentMinutes >= latestClockIn) {
        showMessageToUser('❌ Clock-in not allowed after 4:00 PM PST', 'error');
        return;
      }

      // Show warning if late (after 7:10 AM)
      if (currentMinutes > lateThreshold) {
        showMessageToUser('⚠️ Late clock-in recorded (after 7:10 AM)', 'warning');
      }
    }

    const lastAction = employeeStatus[pin];

    const validTransitions: { [key: string]: string[] } = {
      'clockIn': ['clockOut', 'absent', undefined],
      'clockOut': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'],
      'startBreak': ['clockIn', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'],
      'endBreak': ['startBreak'],
      'startRestroom': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'],
      'endRestroom': ['startRestroom'],
      'startLunch': ['clockIn', 'endBreak', 'endRestroom', 'endItIssue', 'endMeeting'],
      'endLunch': ['startLunch'],
      'startItIssue': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endMeeting'],
      'endItIssue': ['startItIssue'],
      'startMeeting': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue'],
      'endMeeting': ['startMeeting']
    };

    if (!validTransitions[selectedAction]?.includes(lastAction)) {
      let message = `Invalid action: ${selectedAction}, Last Action: ${lastAction || 'None'}`;
      if (selectedAction === 'clockOut' && !lastAction) message = 'You must clock in before you can clock out';
      if (['startBreak', 'startRestroom', 'startLunch', 'startItIssue', 'startMeeting'].includes(selectedAction) && !lastAction) {
        message = 'You must clock in first';
      }
      if (selectedAction.startsWith('end') && !lastAction?.startsWith('start')) {
        message = `You must start ${selectedAction.replace('end', '').toLowerCase()} before you can end it`;
      }
      showMessageToUser(message, 'error');
      return;
    }

    // Use PST time
    const pstTime = getPSTTime();
    const record = { action: selectedAction.charAt(0).toUpperCase() + selectedAction.slice(1), time: pstTime };

    let ipResponse = await fetch('https://api.ipify.org?format=json');
    let ipData = await ipResponse.json();
    let ip = ipData.ip;

    fetch('/add-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, action: record.action, time: record.time, ip: ip })
    })
      .then((response) => {
        if (!response.ok) return response.json().then((error) => Promise.reject(error));
        return response.json();
      })
      .then((data) => {
        setEmployeeStatus({
          ...employeeStatus,
          [pin]: selectedAction,
        });
        setTimeCardRecords([...timeCardRecords, { id: data.id, name: data.name, pin, action: record.action, time: record.time, ip: ip }]);
        
        // Save PIN if remember is checked
        if (rememberPin) {
          localStorage.setItem('rememberedPin', pin);
        }
        
        // Keep PIN in place so employee can continue taking actions
        // They can manually clear it when done using the "Clear PIN" button
        showMessageToUser('Time recorded successfully', 'success');
      })
      .catch((error) => {
        console.error('Error adding record:', error.error);
        showMessageToUser('Error adding record: ' + error.error, 'error');
      });
  };

  function showMessageToUser(text: string, type: 'success' | 'error' | 'warning' | 'info') {
    const messageContainer = document.getElementById('message-container');
    const message = document.createElement('p');
    message.classList.add(`${type}-message`);
    message.textContent = text;
    messageContainer?.appendChild(message);
    message.classList.add('show');
    setTimeout(() => {
      message.classList.add('hide');
      setTimeout(() => { messageContainer?.removeChild(message); }, 1000);
    }, 3000);
  }

  const onLoginSuccess = () => {
    setShowLogin(false);
    setShowLoginButton(false);
    setIsLoggedIn(true);
  };

  const onCreateAdminSuccess = () => {
    setShowCreateAdmin(false);
    setShowLoginButton(false);
    setIsLoggedIn(true);
  };

  const onAddEmployeeSuccess = () => {
    setShowAddEmployee(false);
    showMessageToUser('Employee added', 'info');
  };

  const onCloseOverlay = () => {
    setShowLogin(false);
    setShowCreateAdmin(false);
    setShowAddEmployee(false);
  };

  const refreshRecords = () => {
    fetch('/get-records', { 
      method: 'POST',
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((records) => setTimeCardRecords(records))
      .catch((error) => console.error('Error refreshing records:', error));
  };

  // Get smart buttons based on current employee status
  const getSmartButtons = () => {
    const currentStatus = employeeStatus[pin];

    // Not clocked in - show Clock In button inside PIN card
    if (!currentStatus || currentStatus === 'clockOut') {
      return null; // Button will be in PIN card
    }

    // On a specific break/activity - show only the corresponding "End" button in PIN card
    if (currentStatus === 'startBreak' || 
        currentStatus === 'startRestroom' || 
        currentStatus === 'startLunch' || 
        currentStatus === 'startItIssue' || 
        currentStatus === 'startMeeting') {
      return null; // Button will be in PIN card
    }

    // Clocked in - show all available options in separate section
    return (
      <>
        <button onClick={() => handleActionClick('clockOut')}>🔴 Clock Out</button>
        <button onClick={() => handleActionClick('startBreak')}>☕ Start Break</button>
        <button onClick={() => handleActionClick('startLunch')}>🍔 Start Lunch</button>
        <button onClick={() => handleActionClick('startRestroom')}>🚻 Restroom</button>
        <button onClick={() => handleActionClick('startItIssue')}>💻 IT Issue</button>
        <button onClick={() => handleActionClick('startMeeting')}>📊 Meeting</button>
      </>
    );
  };

  // Get the single action button for PIN card
  const getSingleActionButton = () => {
    if (pin.length !== 4) return null;
    
    const currentStatus = employeeStatus[pin];

    // Not clocked in
    if (!currentStatus || currentStatus === 'clockOut') {
      return (
        <button 
          onClick={() => handleActionClick('clockIn')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
          }}
        >
          ⚡ CLOCK IN
        </button>
      );
    }

    // On break - show End Break
    if (currentStatus === 'startBreak') {
      return (
        <button 
          onClick={() => handleActionClick('endBreak')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          ✅ End Break
        </button>
      );
    }

    // On restroom
    if (currentStatus === 'startRestroom') {
      return (
        <button 
          onClick={() => handleActionClick('endRestroom')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          ✅ End Restroom
        </button>
      );
    }

    // On lunch
    if (currentStatus === 'startLunch') {
      return (
        <button 
          onClick={() => handleActionClick('endLunch')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          ✅ End Lunch
        </button>
      );
    }

    // IT Issue
    if (currentStatus === 'startItIssue') {
      return (
        <button 
          onClick={() => handleActionClick('endItIssue')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          ✅ End IT Issue
        </button>
      );
    }

    // Meeting
    if (currentStatus === 'startMeeting') {
      return (
        <button 
          onClick={() => handleActionClick('endMeeting')}
          style={{ 
            width: '100%',
            fontSize: '20px',
            padding: '18px',
            margin: '16px 0',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
          }}
        >
          ✅ End Meeting
        </button>
      );
    }

    return null;
  };

  return (
    <div className="time-clock-container" ref={timeClockContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
      <Login showLogin={showLogin} onLoginSuccess={onLoginSuccess} onCloseOverlay={onCloseOverlay} />
      {showAddEmployee && isLoggedIn && <AddEmployee onAddSuccess={onAddEmployeeSuccess} onCloseOverlay={onCloseOverlay} />}
      {showCreateAdmin && !isLoggedIn && <CreateAdmin onCreateSuccess={onCreateAdminSuccess} onCloseOverlay={onCloseOverlay} />}
      
      {/* PWA Install Prompt - Only show for non-admin users */}
      {!isLoggedIn && <PWAInstaller />}
      
      <div className="logo-container">
        <img src="https://storage.googleapis.com/msgsndr/7AsSgaSl1IdPndNHqKfs/media/68e6dc19c4bd9e7a6d37de2b.png" alt="PowerHouze Group Logo" />
      </div>
      <h1>Employee Time Clock</h1>
      <div id="currentTime">{currentTime}</div>
      
      <div className="pin-entry">
        <div id="currentPin">Enter PIN: {pin || '____'}</div>
        
        {/* Remember PIN checkbox */}
        {pin.length === 4 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            margin: '12px 0',
            fontSize: '14px',
            color: '#374151'
          }}>
            <input
              type="checkbox"
              id="rememberPin"
              checked={rememberPin}
              onChange={(e) => {
                setRememberPin(e.target.checked);
                if (e.target.checked) {
                  localStorage.setItem('rememberedPin', pin);
                } else {
                  localStorage.removeItem('rememberedPin');
                }
              }}
              style={{
                width: '18px',
                height: '18px',
                cursor: 'pointer'
              }}
            />
            <label 
              htmlFor="rememberPin" 
              style={{ 
                cursor: 'pointer',
                fontWeight: '600',
                userSelect: 'none'
              }}
            >
              Remember PIN on this device
            </label>
          </div>
        )}

        {/* Single action button (when applicable) */}
        {getSingleActionButton()}
        
        <button className="clear-button" onClick={handleClear}>Clear PIN</button>
      </div>

      {/* Show current status if PIN is entered and employee has a status */}
      {pin.length === 4 && employeeStatus[pin] && (
        <div style={{
          textAlign: 'center',
          margin: '16px auto',
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          color: 'white',
          fontSize: '16px',
          fontWeight: '600',
          maxWidth: '600px',
          backdropFilter: 'blur(10px)'
        }}>
          {(() => {
            const display = formatStatusDisplay(employeeStatus[pin]);
            return (
              <>
                {display.emoji} Current Status: <span style={{ fontWeight: '700' }}>
                  {display.text}
                </span>
              </>
            );
          })()}
        </div>
      )}

      <div id="message-container"></div>
      <div className="main-container">
        <Keypad onKeyPress={handleKeyPress} />
        {/* Only show action buttons container when there are multiple buttons */}
        {getSmartButtons() && (
          <div className="action-buttons">
            {getSmartButtons()}
          </div>
        )}
      </div>
      
      {/* Dashboard Stats - Show below action buttons when logged in */}
      {isLoggedIn && <DashboardStats records={timeCardRecords} employeeStatus={employeeStatus} />}
      {showLoginButton && !isLoggedIn && <button id="loginButton" onClick={() => setShowLogin(true)}>
        🔓 Admin Login</button>}
      {isLoggedIn && <hr></hr>}
      
      {/* Admin Tabs - Contains all admin sections */}
      {isLoggedIn && (
        <AdminTabs 
          records={timeCardRecords}
          showMessageToUser={showMessageToUser}
          onRecordsUpdate={refreshRecords}
          onAddEmployeeSuccess={onAddEmployeeSuccess}
          employeeStatus={employeeStatus}
        />
      )}
      
      {/* Keep Add Employee popup button for quick access */}
      {!isOverlayShowing && isLoggedIn && <button id="addEmployeeButton" onClick={() => { setShowAddEmployee(true) }}>➕ Add Employee</button>}
      {!isOverlayShowing && isLoggedIn && <button id="logoutButton" onClick={() => { setShowLoginButton(true); setIsLoggedIn(false); }}>🚪 Logout</button>}
    </div>
  );
};

export default App;
