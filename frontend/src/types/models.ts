import type {
  Role,
  TaskStatus,
  TaskPriority,
  ProjectStatus,
  LeaveStatus,
  AttendanceEventType,
  AttendanceDayStatus,
  MachineStatus,
  ContactMethod,
  ServiceCallPriority,
  ServiceType,
  ServiceCallStatus,
  ServiceVisitType,
  AttachmentEntityType,
  PermissionScopeType,
  PermissionEffect,
} from './enums';

export interface UserProfile {
  id: string;
  employee_code: string;
  name: string;
  designation?: string | null;
  role: Role;
  manager_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface UserSummary {
  id: string;
  employee_code: string;
  name: string;
  designation?: string | null;
  role: Role;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  assigned_to: string;
  assigned_by: string;
  priority: TaskPriority;
  status: TaskStatus;
  task_date: string;
  due_date?: string | null;
  created_at: string;
  updated_at?: string | null;
  // UI helper projections
  assignee_name?: string;
  assigner_name?: string;
  project_name?: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  changed_by_user_id: string;
  changed_by_name?: string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  owning_manager_id: string;
  status: ProjectStatus;
  start_date?: string | null;
  expected_end_date?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
  manager_name?: string;
  member_count?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_in_project?: string | null;
  is_active: boolean;
  assigned_at: string;
  user_name?: string;
  employee_code?: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  current_approver_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  // UI joins
  employee_name?: string;
  approver_name?: string;
  comments?: string | null;
}

export interface AttendanceEvent {
  id: string;
  user_id: string;
  event_type: AttendanceEventType;
  event_timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

export interface AttendanceDay {
  id: string;
  user_id: string;
  work_date: string;
  punch_in_at?: string | null;
  punch_out_at?: string | null;
  punch_in_location?: string | null;
  punch_out_location?: string | null;
  total_duration_minutes?: number | null;
  status: AttendanceDayStatus;
  user_name?: string;
}

export interface EodReport {
  id: string;
  user_id: string;
  report_date: string;
  project_id?: string | null;
  task_id?: string | null;
  work_completed: string;
  work_remaining?: string | null;
  issues?: string | null;
  notes?: string | null;
  created_at: string;
  user_name?: string;
  project_name?: string;
  task_title?: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  name: string;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at?: string | null;
  machines_count?: number;
}

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  is_primary?: boolean;
}

export interface Machine {
  id: string;
  customer_id: string;
  machine_code: string;
  model_name?: string | null;
  serial_number?: string | null;
  installation_date?: string | null;
  purchase_info?: string | null;
  warranty_info?: string | null;
  location?: string | null;
  status: MachineStatus;
  is_active: boolean;
  created_by: string;
  created_at: string;
  customer_name?: string;
}

export interface ServiceCall {
  id: string;
  service_call_code: string;
  customer_id: string;
  machine_id: string;
  reported_by_contact_id?: string | null;
  contacted_at: string;
  contact_method: ContactMethod;
  issue_reported: string;
  priority: ServiceCallPriority;
  service_type: ServiceType;
  responsible_manager_id: string;
  status: ServiceCallStatus;
  resolution?: string | null;
  created_at: string;
  updated_at?: string | null;
  // UI helpers
  customer_name?: string;
  machine_model?: string;
  machine_serial?: string;
  assigned_employees?: string[];
}

export interface ServiceAssignment {
  id: string;
  service_call_id: string;
  employee_id: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at?: string | null;
  role_in_call?: string | null;
  is_active: boolean;
  employee_name?: string;
}

export interface ServiceVisit {
  id: string;
  service_call_id: string;
  visit_type: ServiceVisitType;
  visit_date: string;
  arrival_time?: string | null;
  departure_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  work_performed: string;
  problem_found?: string | null;
  parts_used?: string | null;
  action_taken?: string | null;
  result?: string | null;
  customer_signoff?: string | null;
  created_by: string;
  created_at: string;
}

export interface ServiceReport {
  id: string;
  service_call_id: string;
  service_visit_id?: string | null;
  report_datetime: string;
  work_performed: string;
  problem_found: string;
  root_cause?: string | null;
  action_taken: string;
  parts_used?: string | null;
  result: string;
  pending_work?: string | null;
  recommendations?: string | null;
  employee_comments?: string | null;
  author_id: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comments?: string | null;
  author_name?: string;
  created_at: string;
}

export interface CalendarEntry {
  entry_date: string;
  entry_type: 'task' | 'leave';
  user_id: string;
  user_name?: string;
  title: string;
  status: string;
  project_id?: string | null;
}

export interface Attachment {
  id: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  uploader_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  download_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string;
  actor_name?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  created_at: string;
}

export interface PermissionDefinition {
  key: string;
  description: string;
  applies_to_role: Role | 'any';
}

export interface PermissionGrant {
  id: string;
  grantee_user_id: string;
  permission_key: string;
  scope_type: PermissionScopeType;
  scope_id?: string | null;
  effect: PermissionEffect;
  granted_by: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
}
