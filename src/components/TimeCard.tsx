import React, { useState, useEffect } from 'react';

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
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [filteredRecords, setFilteredRecords] = useState<Record[]>([]);

  useEffect(() => {
    filterRecords();
  }, [records, filter]);

  const filterRecords = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date;
    
    switch (filter) {
      case 'today':
        startDate = today;
        break;
      case 'week':
        startDate = new Date(today);
        const dayOfWeek = startDate.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as first day
        startDate.setDate(startDate.getDate() - diff);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all':
        setFilteredRecords(records);
        return;
    }
    
    // Filter records by date
    const filtered = records.filter(record => {
      const recordDate = new Date(record.time);
      return recordDate >= startDate;
    });
    
    setFilteredRecords(filtered);
  };

  const groupedRecords: { [pin: string]: { name: string; records: Record[] } } = {};
  const uniqueIps: { [pin: string]: Set<string> } = {};

  filteredRecords.forEach((record) => {
    if (!groupedRecords[record.pin]) {
      groupedRecords[record.pin] = { name: record.name, records: [] };
      uniqueIps[record.pin] = new Set();
    }
    groupedRecords[record.pin].records.push(record);
    uniqueIps[record.pin].add(record.ip);
  });

  const getFilterLabel = () => {
    switch (filter) {
      case 'today': return "Today's Time Cards";
      case 'week': return "This Week's Time Cards";
      case 'month': return "This Month's Time Cards";
      case 'all': return "All Time Cards";
    }
  };

  if (records.length === 0) {
    return (
      <div className="time-card">
        <p>No records found.</p>
      </div>
    );
  }

  return (
    <div className="time-card">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h2 style={{ font: 'bold 1.5rem', margin: 0 }}>{getFilterLabel()}</h2>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('today')}
            style={{
              background: filter === 'today' ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: filter === 'today' ? 'white' : '#374151',
              border: filter === 'today' ? 'none' : '2px solid #e5e7eb',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: filter === 'today' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            Today
          </button>
          
          <button
            onClick={() => setFilter('week')}
            style={{
              background: filter === 'week' ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: filter === 'week' ? 'white' : '#374151',
              border: filter === 'week' ? 'none' : '2px solid #e5e7eb',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: filter === 'week' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            This Week
          </button>
          
          <button
            onClick={() => setFilter('month')}
            style={{
              background: filter === 'month' ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: filter === 'month' ? 'white' : '#374151',
              border: filter === 'month' ? 'none' : '2px solid #e5e7eb',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: filter === 'month' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            This Month
          </button>
          
          <button
            onClick={() => setFilter('all')}
            style={{
              background: filter === 'all' ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: filter === 'all' ? 'white' : '#374151',
              border: filter === 'all' ? 'none' : '2px solid #e5e7eb',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: filter === 'all' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
            }}
          >
            All Records
          </button>
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No records found for this time period.</p>
      ) : (
        <>
          {Object.entries(groupedRecords).map(([pin, data], index) => (
            <div key={index} style={{ marginBottom: '2rem' }}>
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
                    // Determine background color priority
                    let bgColor = 'white';
                    
                    if (record.action === 'Absent') {
                      bgColor = '#fee2e2'; // Light red for absences
                    } else if (record.admin_action === true) {
                      bgColor = '#fef3c7'; // Light yellow for admin actions
                    } else if (uniqueIps[pin].size > 1) {
                      bgColor = '#fef08a'; // Brighter yellow for multiple IPs
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
                        <td>
                          {record.ip}
                          {uniqueIps[pin].size > 1 && (
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '0.8em', 
                              color: '#d97706',
                              fontWeight: 'bold'
                            }}>
                              ⚠️ Multiple IPs
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default TimeCard;
