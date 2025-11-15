import React, { useState, useEffect } from 'react';

interface Employee {
  name: string;
  pin: string;
  tags?: string[];
}

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

interface LiveDashboardProps {
  records: Record[];
  employeeStatus: { [pin: string]: string };
}

interface EmployeeWithStatus extends Employee {
  status: string;
  lastActionTime?: string;
  duration?: string;
}

const LiveDashboard: React.FC<LiveDashboardProps> = ({ records, employeeStatus }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState({
    notClockedIn: true,
    working: false,
    onBreak: false,
    absent: false
  });

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchEmployees();
    const interval = setInterval(fetchEmployees, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/get-users', { method: 'POST' });
      const users = await response.json();
      const employeeList = users
        .filter((user: any) => !user.username && user.pin && user.name)
        .map((user: any) => ({ 
          name: user.name, 
          pin: user.pin,
          tags: user.tags || []
        }));
      setEmployees(employeeList);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const calculateDuration = (timeStr: string): string => {
    try {
      const start = new Date(timeStr);
      const now = new Date();
      const diffMs = now.getTime() - start.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
    } catch {
      return 'N/A';
    }
  };

  const getLastActionTime = (pin: string): string | undefined => {
    const empRecords = records.filter(r => r.pin === pin);
    if (empRecords.length === 0) return undefined;
    empRecords.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return empRecords[0].time;
  };

  // Categorize employees
  const categorizedEmployees = employees.reduce((acc, emp) => {
    const status = employeeStatus[emp.pin];
    const lastActionTime = getLastActionTime(emp.pin);
    const empWithStatus: EmployeeWithStatus = {
      ...emp,
      status: status || 'notClockedIn',
      lastActionTime,
      duration: lastActionTime ? calculateDuration(lastActionTime) : undefined
    };

    // Check if absent today
    const today = new Date().toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
    const absentToday = records.some(r => 
      r.pin === emp.pin && 
      r.action === 'Absent' && 
      r.time.startsWith(today)
    );

    if (absentToday) {
      acc.absent.push(empWithStatus);
    } else if (!status || status === 'clockOut' || status === 'absent') {
      acc.notClockedIn.push(empWithStatus);
    } else if (['startBreak', 'startLunch', 'startRestroom'].includes(status)) {
      acc.onBreak.push(empWithStatus);
    } else {
      acc.working.push(empWithStatus);
    }

    return acc;
  }, {
    notClockedIn: [] as EmployeeWithStatus[],
    working: [] as EmployeeWithStatus[],
    onBreak: [] as EmployeeWithStatus[],
    absent: [] as EmployeeWithStatus[]
  });

  // Apply search and filter
  const filterEmployees = (empList: EmployeeWithStatus[]) => {
    return empList.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           emp.pin.includes(searchTerm);
      const matchesTag = !filterTag || (emp.tags && emp.tags.includes(filterTag));
      return matchesSearch && matchesTag;
    });
  };

  const filteredCategorized = {
    notClockedIn: filterEmployees(categorizedEmployees.notClockedIn),
    working: filterEmployees(categorizedEmployees.working),
    onBreak: filterEmployees(categorizedEmployees.onBreak),
    absent: filterEmployees(categorizedEmployees.absent)
  };

  // Get unique tags
  const allTags = [...new Set(employees.flatMap(emp => emp.tags || []))];

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; color: string; bg: string } } = {
      'clockIn': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'endBreak': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'endRestroom': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'endLunch': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'endItIssue': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'endMeeting': { label: 'Working', color: '#059669', bg: '#d1fae5' },
      'startBreak': { label: 'On Break', color: '#d97706', bg: '#fef3c7' },
      'startLunch': { label: 'Lunch', color: '#dc2626', bg: '#fee2e2' },
      'startRestroom': { label: 'Restroom', color: '#7c3aed', bg: '#f3e8ff' },
      'startItIssue': { label: 'IT Issue', color: '#dc2626', bg: '#fee2e2' },
      'startMeeting': { label: 'Meeting', color: '#2563eb', bg: '#dbeafe' },
      'notClockedIn': { label: 'Not Clocked In', color: '#6b7280', bg: '#f3f4f6' }
    };

    const badge = statusMap[status] || statusMap['notClockedIn'];
    return badge;
  };

  return (
    <div style={{
      maxWidth: '1400px',
      width: '95%',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '24px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          color: '#1e3a8a',
          margin: '0 0 8px 0'
        }}>
          📊 Live Dashboard
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Real-time view of all employee statuses • Auto-refreshes every 30 seconds
        </p>
      </div>

      {/* Quick Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Working Now */}
        <div style={{
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '2px solid #059669',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onClick={() => toggleSection('working')}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(5, 150, 105, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🟢</div>
          <div style={{ fontSize: '36px', fontWeight: '700', color: '#065f46', marginBottom: '4px' }}>
            {filteredCategorized.working.length}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#047857' }}>
            Currently Working
          </div>
        </div>

        {/* Not Clocked In */}
        <div style={{
          background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '2px solid #dc2626',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onClick={() => toggleSection('notClockedIn')}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(220, 38, 38, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔴</div>
          <div style={{ fontSize: '36px', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
            {filteredCategorized.notClockedIn.length}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#b91c1c' }}>
            Not Clocked In
          </div>
        </div>

        {/* On Break */}
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '2px solid #f59e0b',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onClick={() => toggleSection('onBreak')}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(245, 158, 11, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>☕</div>
          <div style={{ fontSize: '36px', fontWeight: '700', color: '#92400e', marginBottom: '4px' }}>
            {filteredCategorized.onBreak.length}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#b45309' }}>
            On Break/Lunch
          </div>
        </div>

        {/* Absent Today */}
        <div style={{
          background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
          borderRadius: '16px',
          padding: '24px',
          border: '2px solid #6b7280',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
        onClick={() => toggleSection('absent')}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(107, 114, 128, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>❌</div>
          <div style={{ fontSize: '36px', fontWeight: '700', color: '#374151', marginBottom: '4px' }}>
            {filteredCategorized.absent.length}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#4b5563' }}>
            Absent Today
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        gap: '16px',
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
        
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>Filter:</span>
            <button
              onClick={() => setFilterTag('')}
              style={{
                background: !filterTag ? '#2563eb' : '#f3f4f6',
                color: !filterTag ? 'white' : '#374151',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                style={{
                  background: filterTag === tag ? '#2563eb' : '#f3f4f6',
                  color: filterTag === tag ? 'white' : '#374151',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Sections */}
      
      {/* Not Clocked In Section */}
      <CollapsibleSection
        title="🔴 Not Clocked In"
        count={filteredCategorized.notClockedIn.length}
        isExpanded={expandedSections.notClockedIn}
        onToggle={() => toggleSection('notClockedIn')}
        bgColor="#fef2f2"
        borderColor="#fecaca"
      >
        <EmployeeGrid employees={filteredCategorized.notClockedIn} getStatusBadge={getStatusBadge} />
      </CollapsibleSection>

      {/* Currently Working Section */}
      <CollapsibleSection
        title="🟢 Currently Working"
        count={filteredCategorized.working.length}
        isExpanded={expandedSections.working}
        onToggle={() => toggleSection('working')}
        bgColor="#f0fdf4"
        borderColor="#bbf7d0"
      >
        <EmployeeGrid employees={filteredCategorized.working} getStatusBadge={getStatusBadge} showDuration />
      </CollapsibleSection>

      {/* On Break Section */}
      <CollapsibleSection
        title="☕ On Break/Lunch"
        count={filteredCategorized.onBreak.length}
        isExpanded={expandedSections.onBreak}
        onToggle={() => toggleSection('onBreak')}
        bgColor="#fefce8"
        borderColor="#fef08a"
      >
        <EmployeeGrid employees={filteredCategorized.onBreak} getStatusBadge={getStatusBadge} showDuration />
      </CollapsibleSection>

      {/* Absent Today Section */}
      <CollapsibleSection
        title="❌ Absent Today"
        count={filteredCategorized.absent.length}
        isExpanded={expandedSections.absent}
        onToggle={() => toggleSection('absent')}
        bgColor="#f9fafb"
        borderColor="#e5e7eb"
      >
        <EmployeeGrid employees={filteredCategorized.absent} getStatusBadge={getStatusBadge} />
      </CollapsibleSection>
    </div>
  );
};

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  bgColor: string;
  borderColor: string;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  count,
  isExpanded,
  onToggle,
  bgColor,
  borderColor,
  children
}) => {
  return (
    <div style={{
      background: 'white',
      borderRadius: '16px',
      marginBottom: '20px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      border: `2px solid ${borderColor}`
    }}>
      <div
        onClick={onToggle}
        style={{
          background: bgColor,
          padding: '20px 24px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = bgColor.replace('f', 'e');
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = bgColor;
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.3rem',
            fontWeight: '700',
            color: '#1e3a8a'
          }}>
            {title}
          </h2>
          <span style={{
            background: 'white',
            color: '#1e3a8a',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '700',
            border: '2px solid #e5e7eb'
          }}>
            {count}
          </span>
        </div>
        <div style={{
          fontSize: '24px',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.3s ease'
        }}>
          ▼
        </div>
      </div>
      
      {isExpanded && (
        <div style={{
          padding: '24px',
          animation: 'slideDown 0.3s ease'
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

// Employee Grid Component
interface EmployeeGridProps {
  employees: EmployeeWithStatus[];
  getStatusBadge: (status: string) => { label: string; color: string; bg: string };
  showDuration?: boolean;
}

const EmployeeGrid: React.FC<EmployeeGridProps> = ({ employees, getStatusBadge, showDuration }) => {
  if (employees.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px',
        color: '#9ca3af',
        fontSize: '15px',
        fontStyle: 'italic'
      }}>
        No employees in this category
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '16px'
    }}>
      {employees.map(emp => {
        const badge = getStatusBadge(emp.status);
        return (
          <div
            key={emp.pin}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '16px',
              transition: 'all 0.2s ease',
              cursor: 'default'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
              e.currentTarget.style.borderColor = '#3b82f6';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '12px'
            }}>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  margin: '0 0 4px 0',
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#1e3a8a'
                }}>
                  {emp.name}
                </h3>
                <div style={{
                  fontSize: '13px',
                  color: '#6b7280',
                  fontWeight: '600'
                }}>
                  PIN: {emp.pin}
                </div>
              </div>
            </div>

            <div style={{
              display: 'inline-block',
              background: badge.bg,
              color: badge.color,
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '700',
              border: `1px solid ${badge.color}40`,
              marginBottom: emp.tags && emp.tags.length > 0 ? '8px' : '0'
            }}>
              {badge.label}
            </div>

            {showDuration && emp.duration && (
              <div style={{
                marginTop: '8px',
                fontSize: '13px',
                color: '#059669',
                fontWeight: '600'
              }}>
                ⏱️ {emp.duration}
              </div>
            )}

            {emp.tags && emp.tags.length > 0 && (
              <div style={{
                marginTop: '8px',
                display: 'flex',
                gap: '4px',
                flexWrap: 'wrap'
              }}>
                {emp.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      background: '#f3f4f6',
                      color: '#4b5563',
                      borderRadius: '6px',
                      fontWeight: '600'
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LiveDashboard;
