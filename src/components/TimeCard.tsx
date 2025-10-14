import React from 'react';

interface Record {
  id: number;
  name: string;
  pin: string;
  action: string;
  time: string;
  ip: string;
  admin_action?: boolean;
  note?: string;
}

interface TimeCardProps {
  records: Record[];
}

const TimeCard: React.FC<TimeCardProps> = ({ records }) => {
  const groupedRecords: { [pin: string]: { name: string; records: Record[] } } = {};
  const uniqueIps: { [pin: string]: Set<string> } = {};

  records.forEach((record) => {
    if (!groupedRecords[record.pin]) {
      groupedRecords[record.pin] = { name: record.name, records: [] };
      uniqueIps[record.pin] = new Set();
    }
    groupedRecords[record.pin].records.push(record);
    uniqueIps[record.pin].add(record.ip);
  });

  if (records.length === 0) {
    return (
      <div className="time-card">
        <p>No one has clocked in yet.</p>
      </div>
    );
  }

  return (
    <div className="time-card">
      <h2 style={{ font: 'bold 1.5rem' }}>Today's Time Cards</h2>
      {Object.entries(groupedRecords).map(([pin, data], index) => (
        <div key={index}>
          <h3>{data.name} - {pin}</h3>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Time</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((record, idx) => {
                // Determine background color
                let bgColor = 'transparent';
                if (record.action === 'Absent') {
                  bgColor = '#fee2e2'; // Light red for absences
                } else if (record.admin_action === true) {
                  bgColor = '#fef3c7'; // Light yellow for admin actions
                } else if (uniqueIps[pin].size > 1) {
                  bgColor = 'yellow'; // Yellow for multiple IPs
                }

                return (
                  <tr key={idx} style={{ backgroundColor: bgColor }}>
                    <td>
                      {record.action === 'Absent' && '❌ '}
                      {record.admin_action && record.action !== 'Absent' && '🔧 '}
                      {record.action}
                      {record.admin_action && <span style={{ color: '#92400e', fontSize: '0.85em', fontStyle: 'italic' }}> (Admin)</span>}
                      {record.note && (
                        <div style={{ 
                          fontSize: '0.85em', 
                          color: '#6b7280', 
                          fontStyle: 'italic', 
                          marginTop: '4px',
                          paddingLeft: '20px'
                        }}>
                          Note: {record.note}
                        </div>
                      )}
                    </td>
                    <td>{record.time}</td>
                    <td>{record.ip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default TimeCard;
