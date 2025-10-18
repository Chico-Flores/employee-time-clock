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
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEmployees, setExpandedEmployees] = useState<{ [pin: string]: boolean }>({});
  const [expandAll, setExpandAll] = useState(false);

  // Helper function to check if clock-in is late (after 7:10 AM PST)
  const isLateClockIn = (timeStr: string): boolean => {
    try {
      const recordTime = new Date(timeStr);
      const hours = recordTime.getHours();
      const minutes = recordTime.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      const lateThreshold = 7 * 60 + 10; // 7:10 AM in minutes (430)
      
      return totalMinutes > lateThreshold;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    filterRecords();
  }, [records, filter, searchTerm]);

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
        setFilteredRecords(records.filter(record => 
          record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          record.pin.includes(searchTerm)
        ));
        return;
    }
    
    // Filter records by date and search term
    const filtered = records.filter(record => {
      const recordDate = new Date(record.time);
      const matchesDate = recordDate >= startDate;
      const matchesSearch = record.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           record.pin.includes(searchTerm);
      return matchesDate && matchesSearch;
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

  const toggleEmployee = (pin: string) => {
    setExpandedEmployees(prev => ({
      ...prev,
      [pin]: !prev[pin]
    }));
  };

  const handleExpandAll = () => {
    const newExpandAll = !expandAll;
    setExpandAll(newExpandAll);
    const newExpanded: { [pin: string]: boolean } = {};
    Object.keys(groupedRecords).forEach(pin => {
      newExpanded[pin] = newExpandAll;
    });
    setExpandedEmployees(newExpanded);
  };

  const calculateTodayHours = (employeeRecords: Record[]): string => {
    const today = new Date().toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
    
    const todayRecords = employeeRecords.filter(r => r.time.startsWith(today));
    todayRecords.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    let totalMinutes = 0;
    let clockInTime: Date | null = null;
    
    todayRecords.forEach(record => {
      if (record.action === 'ClockIn') {
        clockInTime = new Date(record.time);
      } else if (record.action === 'ClockOut' && clockInTime) {
        const diff = (new Date(record.time).getTime() - clockInTime.getTime()) / (1000 * 60);
        totalMinutes += diff;
        clockInTime = null;
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return totalMinutes > 0 ? `${hours}h ${minutes}m` : '0h';
  };

  const getEmployeeStatus = (employeeRecords: Record[]): { status: string; color: string; bg: string } => {
    const sortedRecords = [...employeeRecords].sort((a, b) => 
      new Date(b.time).getTime() - new Date(a.time).getTime()
    );
    const lastAction = sortedRecords[0]?.action;
    
    const statusMap: { [key: string]: { status: string; color: string; bg: string } } = {
      'ClockIn': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'EndBreak': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'EndRestroom': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'EndLunch': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'EndItIssue': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'EndMeeting': { status: 'Working', color: '#059669', bg: '#d1fae5' },
      'StartBreak': { status: 'On Break', color: '#d97706', bg: '#fef3c7' },
      'StartLunch': { status: 'Lunch', color: '#dc2626', bg: '#fee2e2' },
      'StartRestroom': { status: 'Restroom', color: '#7c3aed', bg: '#f3e8ff' },
      'StartItIssue': { status: 'IT Issue', color: '#dc2626', bg: '#fee2e2' },
      'StartMeeting': { status: 'Meeting', color: '#2563eb', bg: '#dbeafe' },
      'ClockOut': { status: 'Clocked Out', color: '#6b7280', bg: '#f3f4f6' },
      'Absent': { status: 'Absent', color: '#dc2626', bg: '#fee2e2' }
    };
    
    return statusMap[lastAction] || { status: 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
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
      maxWidth: '1400px',
      width: '95%',
      margin: '0 auto'
    }}>
      {/* Header with Filters */}
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '24px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#1e3a8a', margin: '0 0 8px 0' }}>
              {getFilterLabel()}
            </h2>
            <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>
              {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'} • 
              {' '}{Object.keys(groupedRecords).length} {Object.keys(groupedRecords).length === 1 ? 'employee' : 'employees'}
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

        {/* Search and Expand Controls */}
        <div style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="🔍 Search by name or PIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1',
              minWidth: '250px',
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '15px',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2563eb'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          
          <button
            onClick={handleExpandAll}
            style={{
              background: expandAll ? '#fbbf24' : '#f3f4f6',
              color: expandAll ? '#78350f' : '#374151',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {expandAll ? '📂 Collapse All' : '📁 Expand All'}
          </button>
        </div>
      </div>

      {filteredRecords.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '3rem',
          textAlign: 'center',
          color: '#6b7280',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem', opacity: 0.3 }}>📭</div>
          <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>
            {searchTerm ? 'No records match your search' : 'No records found for this time period.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.entries(groupedRecords)
            .sort(([, a], [, b]) => a.name.localeCompare(b.name))
            .map(([pin, data]) => {
            const isExpanded = expandedEmployees[pin] || false;
            const status = getEmployeeStatus(data.records);
            const todayHours = calculateTodayHours(data.records);
            
            return (
              <div key={pin} style={{ 
                background: 'white',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: '2px solid #e5e7eb',
                transition: 'all 0.2s ease'
              }}>
                {/* Collapsible Header */}
                <div
                  onClick={() => toggleEmployee(pin)}
                  style={{
                    background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
                    padding: '20px 24px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease',
                    userSelect: 'none'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
                    <h3 style={{ 
                      color: '#1e3a8a', 
                      fontSize: '1.2rem',
                      fontWeight: '700',
                      margin: 0
                    }}>
                      {data.name}
                    </h3>
                    
                    <span style={{
                      background: '#eff6ff',
                      color: '#1e40af',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '700',
                      border: '2px solid #bfdbfe'
                    }}>
                      PIN: {pin}
                    </span>

                    <span style={{
                      background: status.bg,
                      color: status.color,
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '700',
                      border: `2px solid ${status.color}40`
                    }}>
                      {status.status}
                    </span>

                    {todayHours !== '0h' && (
                      <span style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '700',
                        border: '2px solid #fbbf2440'
                      }}>
                        Today: {todayHours}
                      </span>
                    )}

                    <span style={{
                      color: '#6b7280',
                      fontSize: '13px',
                      fontWeight: '600'
                    }}>
                      {data.records.length} {data.records.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>

                  <div style={{
                    fontSize: '20px',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.3s ease',
                    color: '#2563eb'
                  }}>
                    ▼
                  </div>
                </div>

                {/* Expandable Content */}
                {isExpanded && (
                  <div style={{
                    padding: '24px',
                    borderTop: '2px solid #e5e7eb',
                    animation: 'slideDown 0.3s ease'
                  }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ 
                        width: '100%',
                        borderCollapse: 'separate',
                        borderSpacing: 0
                      }}>
                        <thead>
                          <tr style={{ 
                            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)'
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
                            let bgColor = idx % 2 === 0 ? 'white' : '#f9fafb';
                            
                            if (record.action === 'Absent') {
                              bgColor = '#fee2e2';
                            } else if (record.admin_action === true) {
                              bgColor = '#fef3c7';
                            } else if (uniqueIps[pin].size > 1) {
                              bgColor = '#fef08a';
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
                                  {record.action === 'ClockIn' && isLateClockIn(record.time) && '⏰ '}
                                  {record.action}
                                  {record.admin_action && <span style={{ color: '#92400e', fontSize: '0.85em', fontStyle: 'italic', marginLeft: '6px' }}>(Admin)</span>}
                                  {record.action === 'ClockIn' && isLateClockIn(record.time) && (
                                    <span style={{ 
                                      color: '#dc2626', 
                                      fontSize: '0.85em', 
                                      fontWeight: '700',
                                      marginLeft: '6px',
                                      background: '#fee2e2',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #fecaca'
                                    }}>
                                      LATE
                                    </span>
                                  )}
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
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default TimeCard;
