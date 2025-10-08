import React, { useState, useEffect, useRef } from 'react';
import Keypad from './components/Keypad';
import TimeCard from './components/TimeCard';
import CreateAdmin from './components/CreateAdmin';
import AddEmployee from './components/AddEmployee';
import Login from './components/Login';
import './assets/css/styles.css';

const App: React.FC = () => {
  const timeClockContainerRef = useRef<HTMLDivElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showLoginButton, setShowLoginButton] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [pin, setPin] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [timeCardRecords, setTimeCardRecords] = useState<{ id: number; name: string; pin: string; action: string; time: string; ip: string }[]>([]);
  const [employeeStatus, setEmployeeStatus] = useState<{ [pin: string]: string }>({}); // Stores last action per employee
  const isOverlayShowing = showCreateAdmin || showLogin || showAddEmployee;
  const [lastInteractionTime, setLastInteractionTime] = useState(new Date());

  // Effect to update the current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Effect to check if the user is logged in
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

  // Focus on the time clock container when the app first loads
  useEffect(() => {
    if (!showCreateAdmin && !showLogin) {
      timeClockContainerRef.current?.focus();
    }
  }, [showCreateAdmin, showLogin]);

  // Handle user interactions
  const handleInteraction = () => {
    setLastInteractionTime(new Date());
  };

  // Use an effect to set up the inactivity timer and handle user interactions
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

  const handleKeyPress = (key: string) => {
    if (pin.length < 6 && key.trim() !== '' && !isNaN(Number(key))) {
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
    // Flash red and exit early if no PIN is entered
    if (pin === '') {
      document.body.scrollTo(0, 0);
      let currentPin = document.getElementById('currentPin');
      currentPin.style.borderColor = '#ff7866';
      setTimeout(() => { currentPin.style.borderColor = 'gainsboro'; }, 250);
      setTimeout(() => { currentPin.style.borderColor = '#ff7866'; }, 500);
      setTimeout(() => { currentPin.style.borderColor = 'gainsboro'; }, 750);
      return;
    }

    // Get the last action for this employee
    const lastAction = employeeStatus[pin];

    // Validation logic
    const validTransitions: { [key: string]: string[] } = {
      'clockIn': ['clockOut', undefined], // Can only clock in if previously clocked out or first time
      'clockOut': ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'], // Can clock out from clocked in or after ending any activity
      'startBreak': ['clockIn', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'], // Can start break when clocked in or after ending other activities
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

    const record = { action: selectedAction.charAt(0).toUpperCase() + selectedAction.slice(1), time: currentTime };

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

  function downloadRecords() {
    fetch('/download-records', { method: 'POST' })
      .then((response) => response.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'time-cards.csv');
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      })
      .then(() => showMessageToUser('Records downloaded', 'info'))
      .catch((error) => console.error('Error downloading records:', error));
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

  // Get current employee status based on their PIN
  const currentEmployeeStatus = pin ? employeeStatus[pin] : undefined;

  // Determine which buttons to show based on employee status
  const shouldShowButton = (action: string): boolean => {
    if (!pin) return true; // Show all buttons if no PIN entered
    
    // If not clocked in (or no status), only show Clock In
    if (!currentEmployeeStatus || currentEmployeeStatus === 'clockOut') {
      return action === 'clockIn';
    }

    // If clocked in, show Clock Out and all activity start buttons
    if (currentEmployeeStatus === 'clockIn' || currentEmployeeStatus.startsWith('end')) {
      return action === 'clockOut' || 
             action === 'startBreak' || 
             action === 'startRestroom' || 
             action === 'startLunch' || 
             action === 'startItIssue' || 
             action === 'startMeeting';
    }

    // If in an activity, only show the corresponding end button
    if (currentEmployeeStatus === 'startBreak') return action === 'endBreak';
    if (currentEmployeeStatus === 'startRestroom') return action === 'endRestroom';
    if (currentEmployeeStatus === 'startLunch') return action === 'endLunch';
    if (currentEmployeeStatus === 'startItIssue') return action === 'endItIssue';
    if (currentEmployeeStatus === 'startMeeting') return action === 'endMeeting';

    return false;
  };

  return (
    <div className="time-clock-container" ref={timeClockContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
      <Login showLogin={showLogin} onLoginSuccess={onLoginSuccess} onCloseOverlay={onCloseOverlay} />
      {showAddEmployee && isLoggedIn && <AddEmployee onAddSuccess={onAddEmployeeSuccess} onCloseOverlay={onCloseOverlay} />}
      {showCreateAdmin && !isLoggedIn && <CreateAdmin onCreateSuccess={onCreateAdminSuccess} onCloseOverlay={onCloseOverlay} />}
      <h1>Employee Time Clock</h1>
      <div id="currentTime">Current Time: {currentTime}</div>
      <div className="pin-entry">
        <div id="currentPin">Enter Your PIN: {pin}</div>
        <button className="clear-button" onClick={handleClear}>Clear</button>
      </div>
      <div id="message-container"></div>
      <div className="main-container">
        <Keypad onKeyPress={handleKeyPress} />
      </div>
      <div className="action-buttons">
        {shouldShowButton('clockIn') && (
          <button onClick={() => handleActionClick('clockIn')}>Clock In</button>
        )}
        {shouldShowButton('clockOut') && (
          <button onClick={() => handleActionClick('clockOut')}>Clock Out</button>
        )}
        {shouldShowButton('startBreak') && (
          <button onClick={() => handleActionClick('startBreak')}>Start Break</button>
        )}
        {shouldShowButton('endBreak') && (
          <button onClick={() => handleActionClick('endBreak')}>End Break</button>
        )}
        {shouldShowButton('startRestroom') && (
          <button onClick={() => handleActionClick('startRestroom')}>Start Restroom</button>
        )}
        {shouldShowButton('endRestroom') && (
          <button onClick={() => handleActionClick('endRestroom')}>End Restroom</button>
        )}
        {shouldShowButton('startLunch') && (
          <button onClick={() => handleActionClick('startLunch')}>Start Lunch</button>
        )}
        {shouldShowButton('endLunch') && (
          <button onClick={() => handleActionClick('endLunch')}>End Lunch</button>
        )}
        {shouldShowButton('startItIssue') && (
          <button onClick={() => handleActionClick('startItIssue')}>Start IT Issue</button>
        )}
        {shouldShowButton('endItIssue') && (
          <button onClick={() => handleActionClick('endItIssue')}>End IT Issue</button>
        )}
        {shouldShowButton('startMeeting') && (
          <button onClick={() => handleActionClick('startMeeting')}>Start Meeting</button>
        )}
        {shouldShowButton('endMeeting') && (
          <button onClick={() => handleActionClick('endMeeting')}>End Meeting</button>
        )}
      </div>
      {showLoginButton && !isLoggedIn && <button id="loginButton" onClick={() => setShowLogin(true)}>
        Login as an administrator to see and download time cards</button>}
      {isLoggedIn && <hr></hr>}
      {isLoggedIn && <TimeCard records={timeCardRecords} />}
      {!isOverlayShowing && isLoggedIn && <button id="downloadButton" onClick={() => { downloadRecords(); }}>Download All Records</button>}
      {!isOverlayShowing && isLoggedIn && <button id="addEmployeeButton" onClick={() => { setShowAddEmployee(true) }}>Add New Employee</button>}
      {!isOverlayShowing && isLoggedIn && <button id="logoutButton" onClick={() => { setShowLoginButton(true); setIsLoggedIn(false); }}>Logout</button>}
    </div>
  );
};

export default App;
