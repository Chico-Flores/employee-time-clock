import React from 'react';

interface DashboardStatsProps {
  records: { id: number; name: string; pin: string; action: string; time: string; ip: string; admin_action?: boolean; note?: string }[];
  employeeStatus: { [pin: string]: string };
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ records, employeeStatus }) => {
  // Calculate currently working employees
  const currentlyWorking = Object.values(employeeStatus).filter(status => 
    ['clockIn', 'endBreak', 'endRestroom', 'endLunch', 'endItIssue', 'endMeeting'].includes(status)
  ).length;

  // Calculate absent today
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric',
    timeZone: 'America/Los_Angeles'
  });
  
  const absentToday = records.filter(record => {
    return record.action === 'Absent' && record.time.startsWith(todayStr);
  }).length;

  // Calculate this week's hours (Monday to Friday)
  const getMonday = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const monday = getMonday(today);
  monday.setHours(0, 0, 0, 0);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  // Filter records for this week (Mon-Fri)
  const weekRecords = records.filter(record => {
    const recordDate = new Date(record.time);
    return recordDate >= monday && recordDate <= friday;
  });

  // Calculate total hours for the week
  const calculateWeekHours = () => {
    const employeeData: { [pin: string]: any[] } = {};
    
    weekRecords.forEach(record => {
      if (!employeeData[record.pin]) {
        employeeData[record.pin] = [];
      }
      employeeData[record.pin].push(record);
    });

    let totalMinutes = 0;

    Object.keys(employeeData).forEach(pin => {
      const empRecords = employeeData[pin];
      empRecords.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

      let clockInTime: Date | null = null;

      empRecords.forEach(record => {
        if (record.action === 'ClockIn') {
          clockInTime = new Date(record.time);
        } else if (record.action === 'ClockOut' && clockInTime) {
          const diff = (new Date(record.time).getTime() - clockInTime.getTime()) / (1000 * 60);
          totalMinutes += diff;
          clockInTime = null;
        }
      });
    });

    return Math.round(totalMinutes / 60);
  };

  const weekHours = calculateWeekHours();

  return (
    <div className="dashboard-stats">
      <div className="stat-card clocked-in">
        <div className="stat-header">
          <span className="stat-icon">🟢</span>
          <span className="stat-label">Currently Working</span>
        </div>
        <div className="stat-value">{currentlyWorking}</div>
        <div className="stat-subtext">Employees clocked in right now</div>
      </div>

      <div className="stat-card absent">
        <div className="stat-header">
          <span className="stat-icon">❌</span>
          <span className="stat-label">Reported Absent</span>
        </div>
        <div className="stat-value">{absentToday}</div>
        <div className="stat-subtext">Employees marked absent today</div>
      </div>

      <div className="stat-card hours">
        <div className="stat-header">
          <span className="stat-icon">⏱️</span>
          <span className="stat-label">This Week's Hours</span>
        </div>
        <div className="stat-value">{weekHours}</div>
        <div className="stat-subtext">Total hours worked Mon-Fri</div>
      </div>
    </div>
  );
};

export default DashboardStats;
