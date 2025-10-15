import React, { useState, useEffect, useRef } from 'react';
import Keypad from './components/Keypad';
import CreateAdmin from './components/CreateAdmin';
import AddEmployee from './components/AddEmployee';
import Login from './components/Login';
import DashboardStats from './components/DashboardStats';
import AdminTabs from './components/AdminTabs';
import PWAInstaller from './components/PWAInstaller';  // ← ADD THIS LINE
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

  // ... (keep all the existing useEffect and handler functions - they don't change)

  return (
    <div className="time-clock-container" ref={timeClockContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
      <Login showLogin={showLogin} onLoginSuccess={onLoginSuccess} onCloseOverlay={onCloseOverlay} />
      {showAddEmployee && isLoggedIn && <AddEmployee onAddSuccess={onAddEmployeeSuccess} onCloseOverlay={onCloseOverlay} />}
      {showCreateAdmin && !isLoggedIn && <CreateAdmin onCreateSuccess={onCreateAdminSuccess} onCloseOverlay={onCloseOverlay} />}
      
      {/* PWA Install Prompt - Only show for non-admin users */}
      {!isLoggedIn && <PWAInstaller />}  {/* ← ADD THIS LINE */}
      
      {/* ... rest of your JSX stays the same ... */}
    </div>
  );
};

export default App;
