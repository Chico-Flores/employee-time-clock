import React, { useState } from 'react';

interface EmployeeSummary {
  name: string;
  totalPaidHours: string;
  paidHoursDisplay: string;
  totalWorkHours: string;
  breakTime: string;
  lunchTime: string;
  restroomTime: string;
  itIssueTime: string;
  meetingTime: string;
  shifts: number;
}

const HoursCalculator: React.FC = () => {
  const [summary, setSummary] = useState<EmployeeSummary[]>([]);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const data = lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const record: any = {};
        headers.forEach((header, i) => {
          record[header] = values[i];
        });
        return record;
      });
    
    calculateHours(data);
  };

  const calculateHours = (data: any[]) => {
    const employeeData: { [key: string]: any } = {};
    
    data.forEach(record => {
      const name = record.name?.trim();
      if (!name) return;
      
      if (!employeeData[name]) {
        employeeData[name] = { name, events: [] };
      }
      
      const time = new Date(record.time);
      const action = record.action;
      
      employeeData[name].events.push({ action, time });
    });

    const summaryData: EmployeeSummary[] = [];
    
    for (const name in employeeData) {
      const emp = employeeData[name];
      emp.events.sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
      
      let totalWorkMinutes = 0;
      let breakMinutes = 0;
      let lunchMinutes = 0;
      let restroomMinutes = 0;
      let itIssueMinutes = 0;
      let meetingMinutes = 0;
      
      let currentClockIn: Date | null = null;
      let currentActivity: string | null = null;
      let activityStart: Date | null = null;
      
      emp.events.forEach((event: any) => {
        const { action, time } = event;
        
        if (action === 'ClockIn') {
          currentClockIn = time;
        } else if (action === 'ClockOut') {
          if (currentClockIn) {
            const diff = (time.getTime() - currentClockIn.getTime()) / (1000 * 60);
            totalWorkMinutes += diff;
            currentClockIn = null;
          }
        } else if (action.startsWith('Start')) {
          activityStart = time;
          currentActivity = action.replace('Start', '');
        } else if (action.startsWith('End')) {
          if (activityStart && currentActivity) {
            const diff = (time.getTime() - activityStart.getTime()) / (1000 * 60);
            
            if (currentActivity === 'Break') breakMinutes += diff;
            else if (currentActivity === 'Lunch') lunchMinutes += diff;
            else if (currentActivity === 'Restroom') restroomMinutes += diff;
            else if (currentActivity === 'ItIssue') itIssueMinutes += diff;
            else if (currentActivity === 'Meeting') meetingMinutes += diff;
            
            activityStart = null;
            currentActivity = null;
          }
        }
      });
      
      const paidMinutes = totalWorkMinutes - breakMinutes - lunchMinutes;
      const paidHours = Math.floor(paidMinutes / 60);
      const paidMins = Math.round(paidMinutes % 60);
      
      summaryData.push({
        name,
        totalPaidHours: (paidMinutes / 60).toFixed(2),
        paidHoursDisplay: `${paidHours}h ${paidMins}m`,
        totalWorkHours: (totalWorkMinutes / 60).toFixed(2),
        breakTime: (breakMinutes / 60).toFixed(2),
        lunchTime: (lunchMinutes / 60).toFixed(2),
        restroomTime: (restroomMinutes / 60).toFixed(2),
        itIssueTime: (itIssueMinutes / 60).toFixed(2),
        meetingTime: (meetingMinutes / 60).toFixed(2),
        shifts: emp.events.filter((e: any) => e.action === 'ClockIn').length
      });
    }
    
    summaryData.sort((a, b) => a.name.localeCompare(b.name));
    setSummary(summaryData);
  };

  const downloadSummary = () => {
    const csvContent = [
      'Employee,Paid Hours (Decimal),Paid Hours (H:M),Total Work Hours,Break Time (hrs),Lunch Time (hrs),Restroom Time (hrs),IT Issue Time (hrs),Meeting Time (hrs),Number of Shifts',
      ...summary.map(emp => 
        `${emp.name},${emp.totalPaidHours},${emp.paidHoursDisplay},${emp.totalWorkHours},${emp.breakTime},${emp.lunchTime},${emp.restroomTime},${emp.itIssueTime},${emp.meetingTime},${emp.shifts}`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hours_summary_detailed.csv';
    a.click();
  };

  return (
    <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', margin: '2rem auto', maxWidth: '1400px', boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' }}>
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>📊 Hours Calculator</h2>
      <p style={{ color: '#666', marginBottom: '30px' }}>Upload your downloaded CSV to calculate payroll hours</p>
      
      <div style={{ 
        border: '3px dashed #2563eb', 
        borderRadius: '15px', 
        padding: '40px', 
        textAlign: 'center',
        marginBottom: '30px',
        background: '#eff6ff'
      }}>
        <input 
          type="file" 
          accept=".csv"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="fileInput"
        />
        <label 
          htmlFor="fileInput"
          style={{
            background: 'linear-gradient(135deg, #2563eb, #1e40af)',
            color: 'white',
            padding: '14px 40px',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'inline-block',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            transition: 'all 0.3s ease'
          }}
        >
          📁 Choose CSV File
        </label>
        {fileName && (
          <p style={{ marginTop: '15px', color: '#059669', fontWeight: 'bold', fontSize: '16px' }}>
            ✓ Loaded: {fileName}
          </p>
        )}
      </div>

      {summary.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ color: '#1e3a8a', margin: 0 }}>Payroll Summary</h3>
            <button
              onClick={downloadSummary}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.3s ease'
              }}
            >
              📥 Download Summary
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontSize: '14px',
              background: 'white',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #1e3a8a, #2563eb)' }}>
                  <th style={{ padding: '14px', textAlign: 'left', color: 'white', fontWeight: '600' }}>Employee</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>💰 Paid Hours</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>☕ Break</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>🍔 Lunch</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>🚻 Restroom</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>💻 IT Issues</th>
                  <th style={{ padding: '14px', textAlign: 'right', color: 'white', fontWeight: '600' }}>📊 Meetings</th>
                  <th style={{ padding: '14px', textAlign: 'center', color: 'white', fontWeight: '600' }}>Shifts</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((emp, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? '#f9fafb' : 'white', borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '14px', fontWeight: 'bold', color: '#1e3a8a' }}>{emp.name}</td>
                    <td style={{ padding: '14px', textAlign: 'right', fontSize: '16px', color: '#2563eb', fontWeight: 'bold' }}>
                      {emp.totalPaidHours} hrs
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right', color: '#6b7280' }}>{emp.breakTime}</td>
                    <td style={{ padding: '14px', textAlign: 'right', color: '#6b7280' }}>{emp.lunchTime}</td>
                    <td style={{ padding: '14px', textAlign: 'right', color: '#6b7280' }}>{emp.restroomTime}</td>
                    <td style={{ padding: '14px', textAlign: 'right', color: parseFloat(emp.itIssueTime) > 1 ? '#dc2626' : '#6b7280', fontWeight: parseFloat(emp.itIssueTime) > 1 ? 'bold' : 'normal' }}>
                      {emp.itIssueTime}
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right', color: '#6b7280' }}>{emp.meetingTime}</td>
                    <td style={{ padding: '14px', textAlign: 'center', color: '#6b7280' }}>{emp.shifts}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', fontWeight: 'bold' }}>
                  <td style={{ padding: '14px', color: '#047857' }}>TOTAL</td>
                  <td style={{ padding: '14px', textAlign: 'right', fontSize: '18px', color: '#059669' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.totalPaidHours), 0).toFixed(2)} hrs
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#047857' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.breakTime), 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#047857' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.lunchTime), 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#047857' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.restroomTime), 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#dc2626' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.itIssueTime), 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#047857' }}>
                    {summary.reduce((sum, emp) => sum + parseFloat(emp.meetingTime), 0).toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ 
            marginTop: '30px', 
            padding: '20px', 
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)', 
            borderRadius: '12px',
            border: '2px solid #fbbf24'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#92400e' }}>💡 How Paid Hours Are Calculated</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e', lineHeight: '1.8' }}>
              <li><strong>Paid Hours</strong> = Total Work Time - Break Time - Lunch Time</li>
              <li><strong>Lunch & Breaks:</strong> SUBTRACTED (unpaid time)</li>
              <li><strong>Restroom, IT Issues, Meetings:</strong> INCLUDED in paid time (tracked for reporting)</li>
              <li>IT Issues over 1 hour are highlighted in red</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default HoursCalculator;
