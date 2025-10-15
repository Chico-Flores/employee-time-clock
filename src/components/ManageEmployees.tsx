import React, { useState, useEffect } from 'react';

interface Employee {
  name: string;
  pin: string;
  _id?: string;
}

interface ManageEmployeesProps {
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onEmployeeDeleted: () => void;
}

const ManageEmployees: React.FC<ManageEmployeesProps> = ({ showMessageToUser, onEmployeeDeleted }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = () => {
    setLoading(true);
    fetch('/get-users', { method: 'POST' })
      .then((response) => response.json())
      .then((users) => {
        // Filter out admin users (those with username field)
        const employeeList = users
          .filter((user: any) => !user.username && user.pin && user.name)
          .map((user: any) => ({ 
            name: user.name, 
            pin: user.pin,
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

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmMessage = `⚠️ DELETE EMPLOYEE: ${employee.name}?\n\n` +
      `PIN: ${employee.pin}\n\n` +
      `This will:\n` +
      `• Remove the employee from the system\n` +
      `• Keep all their time card history\n` +
      `• Prevent them from clocking in\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Type the employee's name to confirm deletion:`;

    const userInput = window.prompt(confirmMessage);
    
    if (userInput === null) {
      // User cancelled
      return;
    }

    if (userInput.trim().toLowerCase() !== employee.name.toLowerCase()) {
      showMessageToUser('Deletion cancelled - name did not match', 'warning');
      return;
    }

    setDeleting(employee.pin);

    try {
      const response = await fetch('/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: employee.pin })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete employee');
      }

      showMessageToUser(`${employee.name} has been deleted`, 'success');
      fetchEmployees(); // Refresh list
      onEmployeeDeleted(); // Notify parent to refresh records if needed
    } catch (error: any) {
      console.error('Delete error:', error);
      showMessageToUser(`Error deleting employee: ${error.message}`, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.pin.includes(searchTerm)
  );

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
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>👥 Manage Employees</h2>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        View and remove employees from the system. Historical records will be preserved.
      </p>

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
            {searchTerm ? 'No employees match your search' : 'No employees found'}
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px' 
          }}>
            {filteredEmployees.map((employee) => (
              <div key={employee.pin} style={{
                border: '2px solid #e5e7eb',
                borderRadius: '16px',
                padding: '24px',
                background: 'linear-gradient(135deg, #f9fafb 0%, #ffffff 100%)',
                transition: 'all 0.3s ease',
                position: 'relative'
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
                <div style={{ marginBottom: '20px' }}>
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

                {/* Delete Button */}
                <button
                  onClick={() => handleDeleteEmployee(employee)}
                  disabled={deleting === employee.pin}
                  style={{
                    width: '100%',
                    background: deleting === employee.pin
                      ? '#9ca3af'
                      : 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: 'white',
                    padding: '14px',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: deleting === employee.pin ? 'not-allowed' : 'pointer',
                    fontSize: '15px',
                    fontWeight: '700',
                    boxShadow: deleting === employee.pin ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.3)',
                    transition: 'all 0.3s ease',
                    opacity: deleting === employee.pin ? 0.6 : 1
                  }}
                  onMouseOver={(e) => {
                    if (deleting !== employee.pin) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (deleting !== employee.pin) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  {deleting === employee.pin ? '⏳ Deleting...' : '🗑️ Delete Employee'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Warning Box */}
      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        background: '#fef2f2', 
        borderRadius: '12px',
        border: '2px solid #fecaca'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#991b1b', fontSize: '15px' }}>
          ⚠️ Important Information
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#991b1b', lineHeight: '1.8', fontSize: '14px' }}>
          <li>Deleting an employee removes their ability to clock in/out</li>
          <li>All historical time card records are preserved for payroll</li>
          <li>This action cannot be undone - you'll need to re-add the employee</li>
          <li>Consider downloading records before deletion if needed</li>
        </ul>
      </div>
    </div>
  );
};

export default ManageEmployees;
