# Company App --- Product Context

## 1. Purpose

This file is the persistent product context for the company application
being developed using **Antigravity** and **Claude Code**.

Both AI tools should refer to this file whenever making product, UI,
database, workflow, permission, or architecture decisions.

### Core principle

Do not unnecessarily change, remove, or reinterpret requirements in this
document. If a new requirement conflicts with an existing requirement,
identify the conflict clearly and ask for a decision rather than
silently changing the existing behavior.

The application should be designed as a **cross-platform application**,
preferably **web-based**, so that it works well on:

-   iOS
-   Android
-   Windows
-   Linux
-   Desktop and laptop browsers
-   Mobile browsers

The application should use a responsive UI and should be usable
comfortably on both mobile phones and larger laptop/desktop screens.

------------------------------------------------------------------------

# 2. Authentication and User Profiles

The application should have login authentication.

For the initial system, login should **not require**:

-   Phone number
-   Email address
-   OTP
-   Social login

The basic login identity should be:

-   User ID
-   Name
-   Designation
-   Password

Each user should have a unique internal user ID.

The system should have role-based access control.

Primary roles:

1.  Employee
2.  Manager
3.  Owner

The Owner has master-level access.

Passwords must be stored securely using proper password hashing. Never
store plain-text passwords.

------------------------------------------------------------------------

# 3. Employee Level

An Employee should have access to the following features.

## 3.1 Daily Tasks

Employee can:

-   See tasks assigned to them.
-   Select/view tasks for a particular day.
-   See task details.
-   See task status.
-   See relevant project information.
-   See who assigned the task.
-   See deadlines/dates where applicable.

Employees should not be able to modify tasks unless the permission
system explicitly allows it.

------------------------------------------------------------------------

## 3.2 Leave Application

Employee can:

-   Apply for leave.
-   Select leave date/date range.
-   Enter reason/details.
-   See leave application status.
-   See whether leave was approved or rejected.
-   See who approved/rejected it.

Normal flow:

`Employee → Manager → Approval/Rejection`

The exact approval chain should be configurable according to the
reporting hierarchy.

------------------------------------------------------------------------

## 3.3 EOD Report

EOD means End Of Day report.

Employee should be able to submit an EOD report containing information
such as:

-   Date
-   Tasks worked on
-   Work completed
-   Work remaining
-   Problems/issues
-   Notes/comments
-   Related project/task
-   Optional supporting information

Once submitted, the appropriate Manager and Owner should be able to view
the report according to permissions.

The system should maintain historical EOD reports.

------------------------------------------------------------------------

## 3.4 Assigned Projects

Employee can see:

-   Projects allotted to them.
-   Project name.
-   Project description.
-   Their role/responsibility.
-   Project status.
-   Relevant tasks.
-   Other useful project information allowed by permissions.

Employee should not automatically have permission to edit project
information.

------------------------------------------------------------------------

# 4. Attendance / Punch In and Punch Out

At the beginning of the workday, an employee should be able to:

### Punch In

The system records:

-   Employee
-   Date
-   Time
-   Location
-   Attendance event
-   Device/session information if appropriate and legally/technically
    justified

At the end of the workday, employee should be able to:

### Punch Out

The system records:

-   Employee
-   Date
-   Time
-   Location
-   Attendance event

The system should maintain an attendance history.

Attendance data should be stored in the application's database.

A spreadsheet/reporting integration may also be used so that attendance
information is maintained in a spreadsheet as required by the company.

### Location

Location should be requested only when required for the attendance
event.

The application should clearly request location permission from the user
and should not continuously track the employee's location unless a
separate requirement is explicitly added later.

------------------------------------------------------------------------

# 5. Manager Level

A Manager has all Employee-level features plus additional management
features.

## 5.1 Employees Assigned to Manager

The Owner assigns employees to Managers.

A Manager should normally be able to access:

-   Employees assigned to them
-   Tasks of assigned employees
-   EOD reports of assigned employees
-   Leave requests of assigned employees
-   Attendance of assigned employees
-   Projects under their management

Managers should not automatically have access to every employee in the
company.

Access must follow the organization hierarchy and permissions.

------------------------------------------------------------------------

## 5.2 Assign Tasks

Manager can:

-   Create tasks.
-   Assign tasks to employees under them.
-   Set task date.
-   Set priority.
-   Set status.
-   Add description.
-   Associate task with a project.
-   Modify task information where permitted.

The system should record:

-   Who created the task
-   Who assigned it
-   Who received it
-   Date/time of creation
-   Changes made to the task

------------------------------------------------------------------------

## 5.3 Leave Approval

Manager can:

-   View leave applications from employees assigned to them.
-   Approve leave.
-   Reject leave.
-   Add comments/reason where appropriate.
-   View leave history.

The system should maintain an audit trail of leave decisions.

------------------------------------------------------------------------

## 5.4 EOD Reports

Manager can:

-   View EOD reports from employees assigned to them.
-   Filter reports by employee/date/project.
-   Review historical reports.

Manager can also submit their **own EOD report**.

A Manager's EOD report should be visible to:

-   Owner
-   Senior Manager above them, if applicable

according to the reporting hierarchy and permissions.

------------------------------------------------------------------------

# 6. Manager Hierarchy

Managers may themselves report to another Manager.

The Owner controls the hierarchy.

Example:

`Owner` → `Senior Manager` → `Manager` → `Employees`

A Manager may therefore have:

-   Employees directly assigned to them.
-   Other Managers assigned under them.
-   Access to those subordinate Managers' information where Owner
    permissions allow it.

A Manager may be able to:

-   See status of subordinate Managers.
-   See their reports.
-   See their leave requests.
-   Assign tasks to subordinate Managers.
-   View relevant projects.
-   Perform other management functions allowed by the Owner.

------------------------------------------------------------------------

# 7. Manager Self-Assigned Work

A Manager must be able to assign tasks to themselves.

A Manager should be able to:

-   Create their own task.
-   Assign the task to themselves.
-   Track its status.
-   Complete/update the task.
-   Submit an EOD report for that work.

Their senior Manager and/or Owner should be able to see this information
according to the hierarchy.

------------------------------------------------------------------------

# 8. Project Management

Managers should be able to create and manage projects under their
responsibility, subject to Owner permissions.

Manager project capabilities may include:

-   Create project.
-   Edit project.
-   Update project status.
-   View project details.
-   View employees assigned to project.
-   Add/remove employees from project where permitted.
-   View project tasks.
-   View project reports.

Example project statuses may include:

-   Not Started
-   Planning
-   In Progress
-   On Hold
-   Completed
-   Cancelled

The exact status system can be refined during development.

The Owner can control whether a Manager is allowed to:

-   Create projects.
-   Edit projects.
-   Delete/archive projects.
-   Assign employees.
-   Change project status.

------------------------------------------------------------------------

# 9. Attendance Reports

Managers should be able to view attendance reports for employees under
their permitted scope.

Reports may include:

-   Employee
-   Date
-   Punch-in time
-   Punch-out time
-   Total working duration
-   Punch-in location
-   Punch-out location
-   Attendance status

Reports should support useful filtering such as:

-   Employee
-   Date
-   Date range
-   Team
-   Project

Owner should have company-wide access.

------------------------------------------------------------------------

# 10. Team Calendar

The application should have a team calendar.

The calendar should show, where permissions allow:

-   Employee
-   Date
-   Assigned task
-   Project
-   Task status
-   Person who assigned the task
-   Relevant leave
-   Other scheduling information

Example:

`12 Sept`
`Employee A → Installation Task → Project X → Assigned by Manager B`

Managers should see the calendar for their permitted team.

A Manager may also be allowed to see subordinate Manager teams if the
Owner grants permission.

Owner can see the company-wide team calendar.

------------------------------------------------------------------------

# 11. Owner / Master Access

The Owner has master access.

Owner can:

-   View all permitted company data.
-   Create users.
-   Edit users.
-   Delete/deactivate users.
-   Change user roles.
-   Assign employees to Managers.
-   Assign Managers under other Managers.
-   View all tasks.
-   Create/edit/delete tasks.
-   View all projects.
-   Create/edit/delete projects.
-   View all EOD reports.
-   View all attendance.
-   Approve/reject leaves.
-   View all service logs.
-   View all customer profiles.
-   View all machine records.
-   View team calendar.
-   Configure permissions.
-   View reports and dashboards.

The Owner should have access to all profiles.

Deleting users should preferably use a **deactivate/archive** mechanism
rather than permanently deleting historical business records, so
historical tasks, reports, attendance and service records remain intact.

------------------------------------------------------------------------

# 12. Owner-Controlled Permissions

The system must support granular permissions.

The Owner should be able to control what Managers can see and do.

Examples:

-   Manager A can see Manager B's reports.
-   Manager A cannot see Manager B's reports.
-   Manager A can assign tasks to Manager B.
-   Manager A cannot assign tasks to Manager B.
-   Manager A can see Manager B's team.
-   Manager A cannot see Manager B's team.
-   Manager A can modify a project.
-   Manager A can only view the project.
-   Manager A can assign employees to a project.
-   Manager A cannot change project assignments.

Permissions should be implemented systematically rather than through
hard-coded special cases.

Recommended model:

`User → Role → Reporting Hierarchy → Permission Scope`

Where necessary, explicit permission overrides can be applied by the
Owner.

------------------------------------------------------------------------

# 13. SERVICE LOGS

Service Logs are a major part of the application.

The purpose is to maintain a complete historical record of service calls
for machines sold by the company.

Whenever a customer who purchased a machine contacts the company for
service, a **new service entry must be created immediately**.

The system must maintain historical service information so it can be
searched and reviewed in the future.

------------------------------------------------------------------------

# 14. Customer Profile

Each customer should have a Customer Profile.

A Customer Profile should contain information such as:

-   Customer ID
-   Customer/company name
-   Contact information
-   Address
-   Relevant contact persons
-   Notes
-   Machines purchased from the company
-   Service history

The exact customer fields can be expanded later.

------------------------------------------------------------------------

# 15. Customer Machines

A customer may own multiple machines purchased from the company.

Example:

Customer:

`ABC Company`

Machines:

-   Machine 1
-   Machine 2
-   Machine 3
-   Machine 4
-   Machine 5

Each machine should have its own record.

A machine record may contain:

-   Machine ID
-   Machine name/model
-   Serial number
-   Installation date
-   Purchase information
-   Customer
-   Location
-   Warranty information
-   Current status
-   Service history

------------------------------------------------------------------------

# 16. Service Call Creation

Example:

A customer has purchased five machines.

The customer calls regarding **Machine 4**.

The Manager should:

1.  Open the customer's profile.
2.  Select Machine 4.
3.  Create a new service call.
4.  Record the service request immediately.
5.  Enter the issue reported by the customer.
6.  Record when the customer contacted the company.
7.  Assign employee(s).
8.  Select service method.
9.  Track the service call until completion.

The service call must remain associated with:

`Customer → Machine → Service Call → Assigned Employee(s) → Service Report`

------------------------------------------------------------------------

# 17. Service Call Information

A service call should contain information such as:

-   Service Call ID
-   Customer
-   Machine
-   Machine serial number
-   Date/time customer contacted company
-   Person who contacted company
-   Contact method
-   Issue reported
-   Priority
-   Manager responsible
-   Assigned employee(s)
-   Service type
-   Service location
-   Current status
-   Resolution
-   Notes
-   Attachments/photos/documents where required
-   Created date/time
-   Updated date/time

Possible service methods:

-   Online support
-   Phone support
-   Remote support
-   Field visit
-   Other

------------------------------------------------------------------------

# 18. Service Employee Assignment

Manager can assign one or more employees to a service call.

The system should record:

-   Assigned employee
-   Assigned by
-   Assignment date/time
-   Role in service call
-   Visit/support type
-   Service status

The Manager should be able to reassign employees if required, while
preserving an audit history of previous assignments.

------------------------------------------------------------------------

# 19. Field Service

If an employee visits the customer location, the system should record
relevant information.

Possible information:

-   Employee
-   Customer
-   Machine
-   Service call
-   Visit date
-   Arrival time
-   Departure time
-   Location
-   Work performed
-   Problem found
-   Parts/material used
-   Action taken
-   Final result
-   Customer feedback/sign-off where required
-   Photos/documents if required

Location collection should be limited to the service/attendance event
where needed and should not become continuous employee tracking unless
explicitly required later.

------------------------------------------------------------------------

# 20. Online Support

If the employee provides online/remote support rather than visiting the
customer, the service record should identify it as online support.

The employee should submit:

-   Date/time
-   Problem reported
-   Diagnosis
-   Steps performed
-   Solution
-   Whether issue was resolved
-   Follow-up required
-   Additional notes

------------------------------------------------------------------------

# 21. Employee Service Report

After completing a service call, the employee who handled the work must
submit a service report.

The report should contain:

-   Service call reference
-   Customer
-   Machine
-   Date/time
-   Service type
-   Work performed
-   Problem found
-   Root cause if known
-   Action taken
-   Parts/material used
-   Result
-   Pending work
-   Recommendations
-   Photos/attachments if required
-   Employee comments

The employee submits the report.

The Manager can then review it.

The Owner can also view it.

------------------------------------------------------------------------

# 22. Service Call Status

Service calls should have a clear status lifecycle.

Possible statuses:

-   New
-   Assigned
-   In Progress
-   Waiting for Customer
-   Waiting for Parts
-   Remote Support
-   Field Visit Scheduled
-   Field Visit Completed
-   Resolved
-   Closed
-   Reopened
-   Cancelled

The exact workflow can be refined during implementation.

------------------------------------------------------------------------

# 23. Service History

The database must retain complete service history.

For any customer, the system should allow authorized users to see:

`Customer → All Machines → Machine → All Service Calls → Reports`

For a particular machine, authorized users should be able to see:

-   Every service call
-   Date/time
-   Issue
-   Employees involved
-   Service method
-   Work performed
-   Resolution
-   Parts used
-   Reports
-   Attachments
-   Status history

Historical records must remain available even if an employee later
leaves the company.

------------------------------------------------------------------------

# 24. Audit Trail

Important business actions should have an audit trail.

Examples:

-   User created
-   User modified
-   User deactivated
-   Manager assignment changed
-   Task created
-   Task reassigned
-   Task status changed
-   Leave approved/rejected
-   Project created/modified
-   Employee assigned to project
-   Service call created
-   Employee assigned to service call
-   Service report submitted
-   Service call status changed

Audit records should include, where appropriate:

-   User who performed the action
-   Action
-   Date/time
-   Affected record
-   Previous value
-   New value

Audit history should not be casually editable by normal users.

------------------------------------------------------------------------

# 25. Data Model --- High-Level Entities

The application will likely need the following core entities.

### Users

-   user_id
-   name
-   designation
-   password_hash
-   role
-   manager_id
-   active/inactive status
-   created_at
-   updated_at

### Permissions

-   permission_id
-   user/role scope
-   permission type
-   target scope
-   granted/revoked
-   created_by
-   timestamps

### Tasks

-   task_id
-   title
-   description
-   assigned_to
-   assigned_by
-   project_id
-   date
-   due_date
-   priority
-   status
-   timestamps

### Leave Requests

-   leave_id
-   employee_id
-   start_date
-   end_date
-   reason
-   status
-   approved/rejected_by
-   decision date
-   comments

### EOD Reports

-   report_id
-   user_id
-   date
-   task/project reference
-   work completed
-   pending work
-   issues
-   notes
-   submitted_at

### Attendance

-   attendance_id
-   user_id
-   date
-   punch_in_time
-   punch_in_location
-   punch_out_time
-   punch_out_location
-   total_duration
-   status

### Projects

-   project_id
-   name
-   description
-   owner/manager
-   status
-   start_date
-   expected_end_date
-   actual_end_date
-   timestamps

### Project Members

-   project_id
-   user_id
-   assigned_by
-   assignment date
-   active status

### Customers

-   customer_id
-   customer/company name
-   contacts
-   address
-   notes
-   timestamps

### Machines

-   machine_id
-   customer_id
-   machine model/name
-   serial number
-   installation information
-   warranty information
-   location
-   status
-   timestamps

### Service Calls

-   service_call_id
-   customer_id
-   machine_id
-   reported_by/contact person
-   contacted_at
-   issue
-   priority
-   service type
-   responsible manager
-   status
-   resolution
-   timestamps

### Service Assignments

-   assignment_id
-   service_call_id
-   employee_id
-   assigned_by
-   assigned_at
-   role
-   status

### Service Reports

-   service_report_id
-   service_call_id
-   employee_id
-   visit/support date
-   work performed
-   problem found
-   action taken
-   parts used
-   result
-   pending work
-   recommendations
-   submitted_at

### Attachments

Attachments should be associated with the appropriate business record,
such as:

-   Task
-   EOD report
-   Project
-   Customer
-   Machine
-   Service call
-   Service report

### Audit Logs

-   audit_id
-   user_id
-   action
-   entity type
-   entity ID
-   old value
-   new value
-   timestamp

------------------------------------------------------------------------

# 26. General UI Requirements

The application should prioritize simplicity.

It should work well on:

-   Mobile phone
-   Tablet
-   Laptop
-   Desktop

The UI should be responsive.

Mobile users should not have to use a desktop-style interface that is
difficult to operate.

Important actions should be easy to access.

Examples:

Employee dashboard:

-   Today's Tasks
-   Punch In / Punch Out
-   Apply Leave
-   EOD Report
-   My Projects
-   My Service Assignments
-   Attendance

Manager dashboard:

-   Team Tasks
-   Leave Requests
-   EOD Reports
-   Team Attendance
-   Projects
-   Service Calls
-   Team Calendar

Owner dashboard:

-   Company Overview
-   Employees
-   Managers
-   Tasks
-   Projects
-   Leaves
-   Attendance
-   EOD Reports
-   Customers
-   Machines
-   Service Calls
-   Team Calendar
-   Reports
-   Permissions
-   Audit Logs

------------------------------------------------------------------------

# 27. Search and Filtering

The application should provide useful search and filtering.

Examples:

Search customers by:

-   Name
-   Customer ID
-   Contact
-   Machine serial number

Search machines by:

-   Serial number
-   Customer
-   Model

Search service calls by:

-   Customer
-   Machine
-   Service Call ID
-   Employee
-   Manager
-   Status
-   Date range

Search employees by:

-   Name
-   User ID
-   Designation
-   Manager

------------------------------------------------------------------------

# 28. Notifications

The architecture should allow notifications to be added.

Potential notifications:

-   New task assigned
-   Task changed
-   Leave approved/rejected
-   New EOD report submitted
-   Service call assigned
-   Service report submitted
-   Service call status changed
-   Project update
-   Important pending action

The first version does not have to implement every notification channel.

The system should be designed so notifications can be added later.

------------------------------------------------------------------------

# 29. Reporting

The application should support reports and dashboards.

Potential reports:

### Employee

-   Attendance
-   Tasks
-   EOD reports
-   Leave history
-   Projects

### Manager

-   Team attendance
-   Team task status
-   Pending tasks
-   Leave status
-   EOD reports
-   Project status
-   Service calls
-   Employee workload

### Owner

-   Company-wide attendance
-   Employee/Manager workload
-   Project status
-   Leave status
-   Task status
-   Service activity
-   Customer service history
-   Machine service history

------------------------------------------------------------------------

# 30. Data Integrity and Historical Records

Historical business data is important.

Do not permanently delete records merely because a user, employee,
project, machine, or customer is no longer active.

Prefer:

-   Active/inactive
-   Archived
-   Soft delete

where historical records need to remain available.

Examples:

If an employee leaves:

-   Their account can be deactivated.
-   Their previous tasks remain.
-   Their EOD reports remain.
-   Their attendance remains.
-   Their service reports remain.

If a machine is no longer active:

-   Its service history remains.

If a customer is inactive:

-   Their previous service history remains.

------------------------------------------------------------------------

# 31. Security Requirements

The application contains company and customer information.

Security must be treated as a core requirement.

At minimum:

-   Passwords must be securely hashed.
-   Authentication sessions must be secure.
-   Authorization must be enforced server-side.
-   Users must only access records permitted by their role and scope.
-   Managers must not bypass permissions through URL/API manipulation.
-   Owner-level functions must be protected.
-   Sensitive operations should be audited.
-   Database access must not be exposed directly to the client.
-   Input validation must be performed.
-   File uploads must be validated and protected.
-   API endpoints must enforce authorization.
-   Production secrets must not be hard-coded.
-   Environment variables/secrets management should be used.

Never rely only on hiding UI buttons for security.

------------------------------------------------------------------------

# 32. Architecture Principles

The application should preferably use a modern web architecture that
provides:

-   Responsive frontend
-   Secure backend/API
-   Relational database or another suitable structured database
-   Authentication
-   Role-based authorization
-   Permission system
-   Audit logging
-   File/attachment storage
-   Reporting
-   Future notification support

The exact technology stack should be selected by evaluating:

-   Maintainability
-   Security
-   Mobile usability
-   Performance
-   Cost
-   Ease of deployment
-   Ease of future development
-   Compatibility with Antigravity and Claude Code
-   Long-term company ownership of the source code and data

Do not choose a technology merely because it is fashionable.

------------------------------------------------------------------------

# 33. AI Development Rules

Antigravity and Claude Code should treat this document as the baseline
product specification.

When developing the application:

1.  Read `context.md` before making significant changes.
2.  Preserve existing working functionality.
3.  Do not remove features without explicit approval.
4.  Do not change business rules silently.
5.  Follow the role and permission hierarchy.
6.  Protect historical data.
7.  Prefer modular architecture.
8.  Keep business logic separate from UI.
9.  Keep database schema organized and migration-safe.
10. Validate all authorization server-side.
11. Add tests for important business rules.
12. Explain major architectural decisions.
13. Before making destructive database changes, ask for confirmation.
14. If a requirement is ambiguous, identify the ambiguity and propose
    options.
15. Update this context file when a requirement is formally changed or a
    new permanent requirement is approved.

------------------------------------------------------------------------

# 34. Development Priority

Suggested development order:

## Phase 1 --- Foundation

-   Project setup
-   Authentication
-   Users
-   Roles
-   Manager hierarchy
-   Permission framework
-   Database
-   Basic responsive UI

## Phase 2 --- Employee Management

-   Tasks
-   Leave
-   EOD reports
-   Projects
-   Attendance
-   Punch in/out
-   Team calendar

## Phase 3 --- Manager / Owner Controls

-   Employee allocation
-   Manager hierarchy
-   Permission controls
-   Manager project management
-   Manager self-tasking
-   Attendance reports
-   Management dashboards

## Phase 4 --- Service Management

-   Customers
-   Machines
-   Service calls
-   Employee assignments
-   Field/online service
-   Service reports
-   Service history
-   Attachments
-   Service dashboards

## Phase 5 --- Advanced Features

-   Notifications
-   Advanced reports
-   Export
-   Spreadsheet integration
-   Improved dashboards
-   Audit tools
-   Performance improvements
-   Additional mobile/PWA capabilities

------------------------------------------------------------------------

# 35. Important Business Rule Summary

The following rules are particularly important:

1.  Employees can see and manage their own permitted work.
2.  Managers manage employees assigned to them.
3.  Owner controls employee/manager allocation.
4.  Owner controls cross-manager visibility and permissions.
5.  Managers can manage themselves as task assignees.
6.  Managers can submit EOD reports for their own work.
7.  Senior Managers/Owner can see subordinate Manager information
    according to hierarchy and permissions.
8.  Owners have master access.
9.  Attendance records punch-in and punch-out time and location.
10. Attendance data must remain historically available.
11. A customer service call must result in a new service entry
    immediately.
12. Every service call must be associated with the correct customer and
    machine.
13. Managers assign employees to service calls.
14. Employees submit service reports after completing service work.
15. Managers and Owner can review service reports.
16. Customer-machine-service history must remain available for future
    reference.
17. Historical business records should not be permanently deleted
    unnecessarily.
18. Authorization must be enforced on the backend/server, not only in
    the UI.
19. The application should work across iOS, Android, Windows and Linux,
    preferably through a responsive web application.
20. The system should be designed so future requirements can be added
    without rewriting the entire application.

------------------------------------------------------------------------

# 36. Future Requirements

This document is a living product context.

Future requirements may include:

-   Inventory/parts management
-   Spare parts used during service
-   Purchase/order management
-   Customer communication history
-   Quotation management
-   AMC/annual maintenance contracts
-   Warranty management
-   Service billing
-   Expense reporting
-   Travel/field visit expenses
-   Customer signatures
-   PDF service reports
-   WhatsApp/email notifications
-   Advanced analytics
-   Mobile PWA installation
-   Offline capabilities for field employees
-   Integration with accounting/ERP systems
-   Spreadsheet import/export
-   Backup and disaster recovery

These are **future possibilities only** unless explicitly approved as
requirements.

------------------------------------------------------------------------

# 37. Change Management

When a new requirement is provided:

1.  Determine whether it is new functionality or a change to existing
    functionality.
2.  Check whether it conflicts with the current context.
3.  Identify affected modules.
4.  Identify database/schema implications.
5.  Identify permission/security implications.
6.  Implement the change without unnecessarily breaking existing
    functionality.
7.  Update `context.md` if the requirement is permanent.
8.  Record significant architectural decisions separately if
    appropriate.

**This file is the source of truth for the current approved product
requirements.**
