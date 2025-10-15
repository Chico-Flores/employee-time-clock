import React, { useState, useEffect } from 'react';

interface Employee {
  name: string;
  pin: string;
  tags?: string[];
  _id?: string;
}

interface EmployeeTagsProps {
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onTagsUpdated: () => void;
}

// Predefined tag options with colors
const TAG_OPTIONS = [
  { label: 'Full-time', color: '#10b981', bgColor: '#d1fae5' },
  { label: 'Part-time', color: '#3b82f6', bgColor: '#dbeafe' },
  { label: 'Remote', color: '#8b5cf6', bgColor: '#ede9fe' },
  { label: 'Manager', color: '#f59e0b', bgColor: '#fef3c7' },
  { label: 'Supervisor', color: '#ef4444', bgColor: '#fee2e2' },
  { label: 'Trainee', color: '#06b6d4', bgColor: '#cffafe' },
  { label: 'Seasonal', color: '#ec4899', bgColor: '#fce7f3' }
];

const EmployeeTags: React.FC<EmployeeTagsProps> = ({ showMessageToUser, onTagsUpdated }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = () => {
    setLoading(true);
    fetch('/get-users', { method: 'POST' })
      .then((response) => response.json())
      .then((users) => {
        const employeeList = users
          .filter((user: any) => !user.username && user.pin && user.name)
          .map((user: any) => ({ 
            name: user.name, 
            pin: user.pin,
            tags: user.tags || [],
            _id: user._id 
          }))
          .sort((a: Employee, b: Employee) => a.name.localeCompare(b.name));
        setEmployees(employeeList);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching employees:', error);
        showMessageToUser('Error loading employees', 'error');
        setLoading(false);
      });
  };

  const getTagStyle = (tagLabel: string) => {
    const tag = TAG_OPTIONS.find(t => t.label === tagLabel);
    return tag || { label: tagLabel, color: '#6b7280', bgColor: '#f3f4f6' };
  };

  const handleEditTags = (employee: Employee) => {
    setEditingPin(employee.pin);
    setSelectedTags(employee.tags || []);
  };

  const handleToggleTag = (tagLabel: string) => {
    if (selectedTags.includes(tagLabel)) {
      setSelectedTags(selectedTags.filter(t => t !== tagLabel));
    } else {
      setSelectedTags([...selectedTags, tagLabel]);
    }
  };

  const handleSaveTags = async (pin: string) => {
    try {
      const response = await fetch('/update-employee-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, tags: selectedTags })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update tags');
      }

      showMessageToUser('Tags updated successfully', 'success');
      setEditingPin(null);
      fetchEmployees();
      onTagsUpdated();
    } catch (error: any) {
      console.error('Update tags error:', error);
      showMessageToUser(`Error updating tags: ${error.message}`, 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditingPin(null);
    setSelectedTags([]);
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.pin.includes(searchTerm);
    const matchesTag = !filterTag || (emp.tags && emp.tags.includes(filterTag));
    return matchesSearch && matchesTag;
  });

  // Count employees by tag
  const tagCounts: { [key: string]: number } = {};
  employees.forEach(emp => {
    emp.tags?.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  if (loading) {
    return (
      <div style={{ 
        background: 'white', 
        borderRadius: '20px', 
        padding: '3rem', 
        margin: '2rem auto', 
        maxWidth: '1400px',
        width: '95%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⏳</div>
        <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Loading employees...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'white', 
      borderRadius: '20px', 
      padding: '2rem', 
      margin: '2rem auto', 
      maxWidth: '1400px',
      width: '95%',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)' 
    }}>
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>🏷️ Employee Tags</h2>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Organize employees with tags for better filtering and management
      </p>

      {/* Tag Filter Buttons */}
      <div style={{ marginBottom: '25px' }}>
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            color: '#6b7280',
            marginRight: '8px'
          }}>
            Filter by tag:
          </span>
          <button
            onClick={() => setFilterTag('')}
            style={{
              background: !filterTag ? 'linear-gradient(135deg, #2563eb, #1e40af)' : '#f3f4f6',
              color: !filterTag ? 'white' : '#374151',
              border: !filterTag ? 'none' : '2px solid #e5e7eb',
              padding: '8px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
          >
            All ({employees.length})
          </button>
          {TAG_OPTIONS.map(tag => (
            <button
              key={tag.label}
              onClick={() => setFilterTag(tag.label)}
              style={{
                background: filterTag === tag.label ? tag.bgColor : '#f3f4f6',
                color: filterTag === tag.label ? tag.color : '#374151',
                border: `2px solid ${filterTag === tag.label ? tag.color : '#e5e7eb'}`,
                padding: '8px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                transition: 'all 0.2s ease'
              }}
            >
              {tag.label} ({tagCounts[tag.label] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '25px' }}>
        <input
          type="text"
          placeholder="🔍 Search by name or PIN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '14px 18px',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            fontSize: '16px',
            transition: 'all 0.3s ease'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563eb'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />
      </div>

      {filteredEmployees.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem', 
          color: '#6b7280',
          background: '#f9fafb',
          borderRadius: '12px',
          border: '2px dashed #e5e7eb'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem', opacity: 0.3 }}>🔍</div>
          <p style={{ fontSize: '1.1rem', fontStyle: 'italic' }}>
            {searchTerm || filterTag ? 'No employees match your filters' : 'No employees found'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ 
            marginBottom: '15px',
            color: '#6b7280',
            fontSize: '14px',
            fontWeight: '600'
          }}>
            Showing {filteredEmployees.length} {filteredEmployees.length === 1 ? 'employee' : 'employees'}
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '20px' 
          }}>
            {filteredEmployees.map((employee) => (
              <div key={employee.pin} style={{
                border: '2px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                {/* Employee Info */}
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ 
                    margin: '0 0 8px 0', 
                    color: '#1e3a8a', 
                    fontSize: '1.3rem',
                    fontWeight: '700'
                  }}>
                    {employee.name}
                  </h3>
                  <div style={{
                    display: 'inline-block',
                    background: '#eff6ff',
                    color: '#1e40af',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: '700',
                    border: '2px solid #bfdbfe'
                  }}>
                    PIN: {employee.pin}
                  </div>
                </div>

                {/* Current Tags Display */}
                {editingPin !== employee.pin && (
                  <div style={{ marginBottom: '16px', minHeight: '40px' }}>
                    {employee.tags && employee.tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {employee.tags.map(tag => {
                          const tagStyle = getTagStyle(tag);
                          return (
                            <span key={tag} style={{
                              background: tagStyle.bgColor,
                              color: tagStyle.color,
                              padding: '6px 12px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '600',
                              border: `1px solid ${tagStyle.color}40`
                            }}>
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic' }}>
                        No tags assigned
                      </span>
                    )}
                  </div>
                )}

                {/* Tag Editor */}
                {editingPin === employee.pin && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ 
                      background: '#f9fafb',
                      padding: '16px',
                      borderRadius: '12px',
                      border: '2px solid #e5e7eb'
                    }}>
                      <p style={{ 
                        margin: '0 0 12px 0', 
                        fontSize: '13px', 
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        Select tags:
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TAG_OPTIONS.map(tag => {
                          const isSelected = selectedTags.includes(tag.label);
                          return (
                            <button
                              key={tag.label}
                              onClick={() => handleToggleTag(tag.label)}
                              style={{
                                background: isSelected ? tag.bgColor : 'white',
                                color: isSelected ? tag.color : '#6b7280',
                                border: `2px solid ${isSelected ? tag.color : '#e5e7eb'}`,
                                padding: '8px 14px',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '600',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {isSelected ? '✓ ' : ''}{tag.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {editingPin !== employee.pin ? (
                  <button
                    onClick={() => handleEditTags(employee)}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                      padding: '12px',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb, #1e40af)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    🏷️ Edit Tags
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleSaveTags(employee.pin)}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                        padding: '12px',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      ✓ Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        flex: 1,
                        background: '#f3f4f6',
                        color: '#374151',
                        padding: '12px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Info Box */}
      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        background: '#eff6ff', 
        borderRadius: '12px',
        border: '2px solid #bfdbfe'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#1e40af', fontSize: '15px' }}>
          💡 About Tags
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#1e40af', lineHeight: '1.8', fontSize: '14px' }}>
          <li>Tags help organize and filter employees by role or status</li>
          <li>Employees can have multiple tags assigned</li>
          <li>Use filters above to view employees by specific tags</li>
          <li>Tags are visible in reports and time card views</li>
        </ul>
      </div>
    </div>
  );
};

export default EmployeeTags;
