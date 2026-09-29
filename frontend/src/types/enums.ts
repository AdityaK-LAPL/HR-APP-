// Authoritative enums matching backend constraints (docs/api-contract.md §20)

export type Role = 'owner' | 'manager' | 'employee';

export type TaskStatus = 
  | 'not_started' 
  | 'in_progress' 
  | 'blocked' 
  | 'completed' 
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ProjectStatus = 
  | 'not_started' 
  | 'planning' 
  | 'in_progress' 
  | 'on_hold' 
  | 'completed' 
  | 'cancelled';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveDecision = 'approved' | 'rejected';

export type AttendanceEventType = 'punch_in' | 'punch_out';
export type AttendanceDayStatus = 'present' | 'partial' | 'absent' | 'on_leave';

export type MachineStatus = 'active' | 'inactive' | 'decommissioned';

export type ContactMethod = 'phone' | 'email' | 'in_person' | 'other';
export type ServiceCallPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ServiceType = 
  | 'online_support' 
  | 'phone_support' 
  | 'remote_support' 
  | 'field_visit' 
  | 'other';

export type ServiceCallStatus = 
  | 'new' 
  | 'assigned' 
  | 'in_progress' 
  | 'waiting_customer' 
  | 'waiting_parts' 
  | 'remote_support' 
  | 'field_visit_scheduled' 
  | 'field_visit_completed' 
  | 'resolved' 
  | 'closed' 
  | 'reopened' 
  | 'cancelled';

export type ServiceVisitType = 'field_visit' | 'online_support';

export type AttachmentEntityType = 
  | 'task' 
  | 'eod_report' 
  | 'project' 
  | 'customer' 
  | 'machine' 
  | 'service_call' 
  | 'service_report';

export type PermissionScopeType = 'user' | 'team' | 'project' | 'global';
export type PermissionEffect = 'allow' | 'deny';
