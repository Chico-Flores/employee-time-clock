import React, { useState } from 'react';

interface DownloadRecordsProps {
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const DownloadRecords: React.FC<DownloadRecordsProps> = ({ showMessageToUser }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getDateRange = (period: string): { start: string; end: string } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let start: Date;
    let end: Date = new Date(today);
    end.setHours(23, 59, 59, 999);

    switch (period) {
      case 'today':
        start = new Date(today);
        break;
      case 'yesterday':
        start = new Date(today);
        start.setDate(start.getDate() - 1);
        end = new Date(today);
        end.setSeconds(end.getSeconds() - 1);
        break;
      case 'thisWeek':
        start = new Date(today);
        const dayOfWeek = start.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as first day
        start.setDate(start.getDate() - diff);
        break;
      case 'lastWeek':
        start = new Date(today);
        const lastWeekDay = start.getDay();
        const lastWeekDiff = lastWeekDay === 0 ? 6 : lastWeekDay - 1;
        start.setDate(start.getDate() - lastWeekDiff - 7);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last7Days':
        start = new Date(today);
        start.setDate(start.getDate() - 7);
        break;
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start = new Date(today);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const handleQuickFilter = (period: string) => {
    const { start, end } = getDateRange(period);
    setStartDate(start);
    setEndDate(end);
  };

  const downloadRecords = () => {
    let url = '/download-records';
    const params = new URLSearchParams();
    
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    fetch(url, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error('Download failed');
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        
        // Create filename with date range
        let filename = 'time-cards';
        if (startDate && endDate) {
          filename += `_${startDate}_to_${endDate}`;
        } else if (startDate) {
          filename += `_from_${startDate}`;
        } else if (endDate) {
          filename += `_until_${endDate}`;
        }
        filename += '.csv';
        
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        
        const dateInfo = startDate && endDate 
          ? ` (${startDate} to ${endDate})`
          : startDate 
          ? ` (from ${startDate})`
          : endDate 
          ? ` (until ${endDate})`
          : '';
        showMessageToUser(`Records downloaded${dateInfo}`, 'info');
      })
      .catch((error) => {
        console.error('Error downloading records:', error);
        showMessageToUser('Error downloading records', 'error');
      });
  };

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
      <h2 style={{ color: '#1e3a8a', marginBottom: '10px', fontSize: '1.8rem' }}>📥 Download Records</h2>
      <p style={{ color: '#666', marginBottom: '30px' }}>Export time card records as CSV with flexible date filtering</p>
      
      {/* Quick Filter Buttons */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ 
          fontSize: '15px', 
          color: '#374151', 
          fontWeight: '700', 
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Quick Filters
        </h3>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '8px'
        }}>
          <button onClick={() => handleQuickFilter('today')} className="quick-filter-btn">
            Today
          </button>
          <button onClick={() => handleQuickFilter('yesterday')} className="quick-filter-btn">
            Yesterday
          </button>
          <button onClick={() => handleQuickFilter('thisWeek')} className="quick-filter-btn">
            This Week
          </button>
          <button onClick={() => handleQuickFilter('lastWeek')} className="quick-filter-btn">
            Last Week
          </button>
          <button onClick={() => handleQuickFilter('last7Days')} className="quick-filter-btn">
            Last 7 Days
          </button>
          <button onClick={() => handleQuickFilter('thisMonth')} className="quick-filter-btn">
            This Month
          </button>
          <button onClick={() => handleQuickFilter('lastMonth')} className="quick-filter-btn">
            Last Month
          </button>
        </div>
      </div>

      {/* Custom Date Range */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ 
          fontSize: '15px', 
          color: '#374151', 
          fontWeight: '700', 
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Custom Date Range
        </h3>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '15px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              color: '#374151',
              fontSize: '14px'
            }}>
              Start Date:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '16px',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontWeight: '600', 
              color: '#374151',
              fontSize: '14px'
            }}>
              End Date:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '16px',
                transition: 'all 0.3s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2563eb'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>
        </div>
      </div>

      {/* Selected Range Display */}
      {(startDate || endDate) && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          background: '#eff6ff',
          border: '2px solid #bfdbfe',
          borderRadius: '12px',
          color: '#1e40af',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          📅 Selected Range: <strong>{startDate || 'Beginning'}</strong> to <strong>{endDate || 'Today'}</strong>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={downloadRecords}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: 'white',
            padding: '14px 32px',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #059669, #047857)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
          }}
        >
          📥 Download CSV
        </button>
        <button
          onClick={() => {
            setStartDate('');
            setEndDate('');
          }}
          style={{
            background: '#f3f4f6',
            color: '#374151',
            padding: '14px 24px',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#e5e7eb';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Info Box */}
      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        background: 'linear-gradient(135deg, #fef3c7, #fde68a)', 
        borderRadius: '12px',
        border: '2px solid #fbbf24'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#92400e' }}>💡 Export Tips</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e', lineHeight: '1.8' }}>
          <li>Use Quick Filters for common date ranges</li>
          <li>Custom dates allow precise range selection</li>
          <li>Leave dates blank to download all records</li>
          <li>CSV files open in Excel, Google Sheets, and most spreadsheet apps</li>
          <li>Records include: Name, PIN, Action, Time, IP Address, Admin Notes</li>
        </ul>
      </div>

      <style>{`
        .quick-filter-btn {
          background: #f3f4f6;
          border: 2px solid #e5e7eb;
          padding: 10px 18px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          transition: all 0.2s;
        }
        .quick-filter-btn:hover {
          background: #e5e7eb;
          border-color: #2563eb;
          color: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
        }
      `}</style>
    </div>
  );
};

export default DownloadRecords;
