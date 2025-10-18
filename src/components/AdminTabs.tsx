// src/components/AdminTabs.tsx
// REPLACE with this version - fixes import issue
import React, { useState } from 'react';
import LiveDashboard from './LiveDashboard';
import ManualClockOut from './ManualClockOut';
import MarkAbsent from './MarkAbsent';
import TimeCard from './TimeCard';
import HoursCalculator from './HoursCalculator';
import DownloadRecords from './DownloadRecords';
import AddEmployee from './AddEmployee';
import ManageEmployees from './ManageEmployees';
import EmployeeTags from './EmployeeTags';

interface AdminTabsProps {
  records: { id: number; name: string; pin: string; action: string; time: string; ip: string; admin_action?: boolean; note?: string }[];
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onRecordsUpdate: () => void;
  onAddEmployeeSuccess: () => void;
  employeeStatus: { [pin: string]: string };
}

const AdminTabs: React.FC<AdminTabsProps> = ({ 
  records, 
  showMessageToUser, 
  onRecordsUpdate,
  onAddEmployeeSuccess,
  employeeStatus
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'timecards' | 'actions' | 'employees' | 'reports'>('dashboard');

  return (
    <div className="admin-tabs-container">
      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          🔧 Manual Actions
        </button>
        <button 
          className={`tab-btn ${activeTab === 'timecards' ? 'active' : ''}`}
          onClick={() => setActiveTab('timecards')}
        >
          📋 Time Cards
        </button>
        <button 
          className={`tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          ⚙️ Settings
        </button>
        <button 
          className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          👥 Employees
        </button>
        <button 
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          📈 Reports
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'dashboard' && (
          <div className="tab-panel">
            <LiveDashboard 
              records={records}
              employeeStatus={employeeStatus}
            />
          </div>
        )}

        {activeTab === 'live' && (
          <div className="tab-panel">
            <ManualClockOut 
              records={records} 
              showMessageToUser={showMessageToUser} 
              onClockOutSuccess={onRecordsUpdate} 
            />
          </div>
        )}

        {activeTab === 'timecards' && (
          <div className="tab-panel">
            <TimeCard records={records} />
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="tab-panel">
            <MarkAbsent 
              showMessageToUser={showMessageToUser} 
              onMarkAbsentSuccess={onRecordsUpdate} 
            />
            <AddEmployee 
              onAddSuccess={onAddEmployeeSuccess} 
              onCloseOverlay={() => {}} 
              inline={true}
            />
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="tab-panel">
            <ManageEmployees 
              showMessageToUser={showMessageToUser}
              onEmployeeDeleted={onRecordsUpdate}
            />
            <EmployeeTags 
              showMessageToUser={showMessageToUser}
              onTagsUpdated={onRecordsUpdate}
            />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="tab-panel">
            <HoursCalculator />
            <DownloadRecords showMessageToUser={showMessageToUser} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTabs;
