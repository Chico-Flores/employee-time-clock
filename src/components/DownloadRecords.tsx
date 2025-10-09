import React, { useState } from 'react';

interface DownloadRecordsProps {
  showMessageToUser: (text: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const DownloadRecords: React.FC<DownloadRecordsProps> = ({ showMessageToUser }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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
    <div style={{ marginTop: '20px', marginBottom: '20px' }}>
      <button 
        onClick={() => setShowFilters(!showFilters)}
        style={{
          background: '#2563eb',
          color: 'white',
          padding: '12px 24px',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: showFilters ? '15px' : '0'
        }}
      >
        📥 Download Records {showFilters ? '▼' : '▶'}
      </button>

      {showFilters && (
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '20px',
          marginTop: '10px'
        }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#1e3a8a' }}>Filter by Date Range</h3>
          
          {/* Quick Filter Buttons */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '8px', 
            marginBottom: '20px' 
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

          {/* Custom Date Range */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#374151' }}>
                Start Date:
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#374151' }}>
                End Date:
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={downloadRecords}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                padding: '12px 32px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              📥 Download
            </button>
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              style={{
                background: '#6b7280',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              Clear Filters
            </button>
          </div>

          {(startDate || endDate) && (
            <div style={{
              marginTop: '15px',
              padding: '12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              color: '#1e40af'
            }}>
              <strong>Selected Range:</strong> {startDate || 'Beginning'} to {endDate || 'Today'}
            </div>
          )}
        </div>
      )}

      <style>{`
        .quick-filter-btn {
          background: #f3f4f6;
          border: 2px solid #e5e7eb;
          padding: 8px 16px;
          border-radius: 6px;
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
        }
      `}</style>
    </div>
  );
};

export default DownloadRecords;
