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
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '3rem',
        margin: '0 auto',
        maxWidth: '1400px',
        width: '95%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '1rem', opacity: 0.3 }}>📋</div>
        <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>No Records Found</h2>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Time cards will appear here once employees start clocking in.</p>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '20px',
      padding: '2rem',
      margin: '0 auto',
      maxWidth: '1400px',
      width: '95%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#1e3a8a', margin: '0 0 8px 0' }}>
            {getFilterLabel()}
          </h2>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
            {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'} found
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('today')}
            style={{
              background: filter === 'today' ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: filter === 'today' ? 'white' : '#374151',
              border: filter === 'today' ? 'none' : '2px solid #e5e7eb',
              padding: '10px 20px',
              borderRadius: '10px',
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
              padding: '10px 20px',
              borderRadius: '10px',
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
              padding: '10px 20px',
              borderRadius: '10px',
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
              padding: '10px 20px',
              borderRadius: '10px',
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
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem', opacity: 0.3 }}>📭</div>
          <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>No records found for this time period.</p>
        </div>
      ) : (
        <>
          {Object.entries(groupedRecords).map(([pin, data], index) => (
            <div key={index} style={{ 
              marginBottom: '2.5rem',
              background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
              borderRadius: '16px',
              padding: '1.5rem',
              border: '2px solid #e5e7eb'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <h3 style={{ 
                  color: '#1e3a8a', 
                  fontSize: '1.3rem',
                  fontWeight: '700',
                  margin: 0
                }}>
                  {data.name}
                </h3>
                <span style={{
                  background: '#eff6ff',
                  color: '#1e40af',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '700',
                  border: '2px solid #bfdbfe'
                }}>
                  PIN: {pin}
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0
                }}>
                  <thead>
                    <tr style={{ 
                      background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                      position: 'sticky',
                      top: 0,
                      zIndex: 10
                    }}>
                      <th style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        borderRadius: '8px 0 0 0'
                      }}>Action</th>
                      <th style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>Time</th>
                      <th style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        borderRadius: '0 8px 0 0'
                      }}>IP Address</th>
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
                        <tr key={idx} style={{ 
                          backgroundColor: bgColor,
                          borderBottom: idx === data.records.length - 1 ? 'none' : '1px solid #e5e7eb',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#e0f2fe';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = bgColor;
                        }}>
                          <td style={{ 
                            padding: '14px 16px',
                            fontWeight: '600',
                            color: '#374151'
                          }}>
                            {record.action === 'Absent' && '❌ '}
                            {record.admin_action && record.action !== 'Absent' && '🔧 '}
                            {record.action}
                            {record.admin_action && <span style={{ color: '#92400e', fontSize: '0.85em', fontStyle: 'italic', marginLeft: '6px' }}>(Admin)</span>}
                            {record.note && (
                              <div style={{ 
                                fontSize: '0.85em', 
                                color: '#6b7280', 
                                fontStyle: 'italic', 
                                marginTop: '6px',
                                paddingLeft: '20px',
                                fontWeight: 'normal'
                              }}>
                                💬 {record.note}
                              </div>
                            )}
                          </td>
                          <td style={{ 
                            padding: '14px 16px',
                            color: '#374151'
                          }}>{record.time}</td>
                          <td style={{ 
                            padding: '14px 16px',
                            color: '#374151'
                          }}>
                            {record.ip}
                            {uniqueIps[pin].size > 1 && (
                              <span style={{ 
                                marginLeft: '10px', 
                                fontSize: '0.8em', 
                                color: '#d97706',
                                fontWeight: 'bold',
                                background: '#fef3c7',
                                padding: '4px 8px',
                                borderRadius: '6px'
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
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default TimeCard;
