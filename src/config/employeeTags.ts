// Employee Tag Configuration
// Edit this file to add, remove, or modify employee tags

export interface TagOption {
  label: string;
  color: string;
  bgColor: string;
}

export const EMPLOYEE_TAG_OPTIONS: TagOption[] = [
  { label: 'Admin', color: '#10b981', bgColor: '#d1fae5' },
  { label: 'Team Lead', color: '#3b82f6', bgColor: '#dbeafe' },
  { label: 'MX', color: '#8b5cf6', bgColor: '#ede9fe' },
  { label: 'EG', color: '#f59e0b', bgColor: '#fef3c7' },
  { label: 'PH', color: '#f97316', bgColor: '#ffedd5' },
  { label: 'Closer', color: '#ef4444', bgColor: '#fee2e2' },
  { label: 'Dialer', color: '#06b6d4', bgColor: '#cffafe' },
  { label: 'New Agent', color: '#ec4899', bgColor: '#fce7f3' },
  
  // ADD YOUR CUSTOM TAGS BELOW:
  // Copy this format and uncomment:
  // { label: 'Your Tag Name', color: '#hexcolor', bgColor: '#hexcolor' },
];

// ========================================
// COLOR PALETTE REFERENCE
// ========================================
// Use these color combinations for consistent styling:
//
// Green:    color: '#10b981', bgColor: '#d1fae5'
// Blue:     color: '#3b82f6', bgColor: '#dbeafe'
// Purple:   color: '#8b5cf6', bgColor: '#ede9fe'
// Orange:   color: '#f59e0b', bgColor: '#fef3c7'
// Red:      color: '#ef4444', bgColor: '#fee2e2'
// Cyan:     color: '#06b6d4', bgColor: '#cffafe'
// Pink:     color: '#ec4899', bgColor: '#fce7f3'
// Indigo:   color: '#7c3aed', bgColor: '#f3e8ff'
// Teal:     color: '#14b8a6', bgColor: '#ccfbf1'
// Amber:    color: '#f97316', bgColor: '#ffedd5'
// Lime:     color: '#84cc16', bgColor: '#ecfccb'
// Rose:     color: '#f43f5e', bgColor: '#ffe4e6'
// Sky:      color: '#0ea5e9', bgColor: '#e0f2fe'
// Violet:   color: '#a855f7', bgColor: '#f3e8ff'
// Emerald:  color: '#10b981', bgColor: '#d1fae5'
// Yellow:   color: '#eab308', bgColor: '#fef9c3'
// Gray:     color: '#6b7280', bgColor: '#f3f4f6'

// ========================================
// USAGE EXAMPLES
// ========================================
// Example 1 - Add a new tag:
// { label: 'Team Lead', color: '#7c3aed', bgColor: '#f3e8ff' },
//
// Example 2 - Change existing tag name:
// { label: 'Full Time Employee', color: '#10b981', bgColor: '#d1fae5' },
//
// Example 3 - Delete a tag:
// Just remove or comment out the line with //
