// Employee Tag Configuration
// Edit this file to add, remove, or modify employee tags

export interface TagOption {
  label: string;
  color: string;
  bgColor: string;
}

export const EMPLOYEE_TAG_OPTIONS: TagOption[] = [
  // Leadership & Admin
  { label: 'Admin', color: '#7c3aed', bgColor: '#f3e8ff' },        // Purple - authority
  { label: 'Team Lead', color: '#f59e0b', bgColor: '#fef3c7' },    // Amber - leadership
  
  // Locations
  { label: 'MX', color: '#10b981', bgColor: '#d1fae5' },           // Green - Mexico
  { label: 'EG', color: '#0ea5e9', bgColor: '#e0f2fe' },           // Sky Blue - Egypt
  { label: 'PH', color: '#f97316', bgColor: '#ffedd5' },           // Orange - Philippines
  
  // Roles
  { label: 'Closer', color: '#dc2626', bgColor: '#fee2e2' },       // Red - high priority
  { label: 'Dialer', color: '#2563eb', bgColor: '#dbeafe' },       // Blue - active calling
  { label: 'New Agent', color: '#ec4899', bgColor: '#fce7f3' },    // Pink - new/training
];

// ========================================
// COLOR STRATEGY
// ========================================
// Admin (Purple) - Distinct authority color
// Team Lead (Amber) - Warm leadership color
// MX (Green) - Mexico flag color
// EG (Sky Blue) - Bright, distinguishable blue
// PH (Orange) - Vibrant, stands out
// Closer (Red) - High impact, closing deals
// Dialer (Blue) - Active, different shade from EG
// New Agent (Pink) - Friendly, training phase
