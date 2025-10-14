import React, { useState, useEffect, useRef } from 'react';
import Keypad from './components/Keypad';
import TimeCard from './components/TimeCard';
import CreateAdmin from './components/CreateAdmin';
import AddEmployee from './components/AddEmployee';
import Login from './components/Login';
import HoursCalculator from './components/HoursCalculator';
import DownloadRecords from './components/DownloadRecords';
import ManualClockOut from './components/ManualClockOut';
import MarkAbsent from './components/MarkAbsent';
import './assets/css/styles.css';

const App: React.FC = () => {
  const timeClockContainerRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showAddEmployee, setShowAddEmployee] = useState(false);
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

    const lastAction = employeeStatus[pin];

    const validTransitions: { [key: string]: string[] } = {
      'clockIn': ['clockOut', undefined],
      'clockOut': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'],
      'startBreak': ['clockIn', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'],
      'endBreak': ['startBreak'],
      'startRestroom': ['clockIn', 'endBreak', 'endLunch', 'endItIssue', 'endMeeting'],
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
        setPin('');
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

  return (
    <div className="time-clock-container" ref={timeClockContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
      <Login showLogin={showLogin} onLoginSuccess={onLoginSuccess} onCloseOverlay={onCloseOverlay} />
      {showAddEmployee && isLoggedIn && <AddEmployee onAddSuccess={onAddEmployeeSuccess} onCloseOverlay={onCloseOverlay} />}
      {showCreateAdmin && !isLoggedIn && <CreateAdmin onCreateSuccess={onCreateAdminSuccess} onCloseOverlay={onCloseOverlay} />}
      
      <div className="logo-container">
        <img src="https://storage.googleapis.com/msgsndr/7AsSgaSl1IdPndNHqKfs/media/68e6dc19c4bd9e7a6d37de2b.png" alt="PowerHouze Group Logo" />
      </div>
      <h1>Employee Time Clock</h1>
      <div id="currentTime">{currentTime}</div>
      
      <div className="pin-entry">
        <div id="currentPin">Enter PIN: {pin || '____'}</div>
        <button className="clear-button" onClick={handleClear}>Clear PIN</button>
      </div>
      <div id="message-container"></div>
      <div className="main-container">
        <Keypad onKeyPress={handleKeyPress} />
        <div className="action-buttons">
          <button onClick={() => handleActionClick('clockIn')}>⚡ Clock In</button>
          <button onClick={() => handleActionClick('clockOut')}>🔴 Clock Out</button>
          <button onClick={() => handleActionClick('startBreak')}>☕ Start Break</button>
          <button onClick={() => handleActionClick('endBreak')}>✅ End Break</button>
          <button onClick={() => handleActionClick('startRestroom')}>🚻 Start Restroom</button>
          <button onClick={() => handleActionClick('endRestroom')}>✅ End Restroom</button>
          <button onClick={() => handleActionClick('startLunch')}>🍔 Start Lunch</button>
          <button onClick={() => handleActionClick('endLunch')}>✅ End Lunch</button>
          <button onClick={() => handleActionClick('startItIssue')}>💻 IT Issue</button>
          <button onClick={() => handleActionClick('endItIssue')}>✅ End IT Issue</button>
          <button onClick={() => handleActionClick('startMeeting')}>📊 Meeting</button>
          <button onClick={() => handleActionClick('endMeeting')}>✅ End Meeting</button>
        </div>
      </div>
      {showLoginButton && !isLoggedIn && <button id="loginButton" onClick={() => setShowLogin(true)}>
        🔐 Admin Login</button>}
      {isLoggedIn && <hr></hr>}
      {isLoggedIn && <ManualClockOut records={timeCardRecords} showMessageToUser={showMessageToUser} onClockOutSuccess={refreshRecords} />}
      {isLoggedIn && <MarkAbsent showMessageToUser={showMessageToUser} onMarkAbsentSuccess={refreshRecords} />}
      {isLoggedIn && <TimeCard records={timeCardRecords} />}
      {isLoggedIn && <HoursCalculator />}
      {!isOverlayShowing && isLoggedIn && <DownloadRecords showMessageToUser={showMessageToUser} />}
      {!isOverlayShowing && isLoggedIn && <button id="addEmployeeButton" onClick={() => { setShowAddEmployee(true) }}>➕ Add Employee</button>}
      {!isOverlayShowing && isLoggedIn && <button id="logoutButton" onClick={() => { setShowLoginButton(true); setIsLoggedIn(false); }}>🚪 Logout</button>}
    </div>
  );
};

export default App;
