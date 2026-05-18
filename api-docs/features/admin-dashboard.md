# Admin Dashboard (Laravel Internal Panel)

## Purpose

This dashboard is an internal control panel built fully inside Laravel (Blade + Bootstrap). It is intentionally isolated from the Next.js frontend and serves operational/admin workflows.

## Architecture

### Routing

- Prefix: `/admin`
- Names: `admin.*`
- Route groups:
  - Guest admin routes: `admin.login.show`, `admin.login.store`
  - Authenticated admin routes: `admin.dashboard`, `admin.logout`, `admin.users.*`

### Authentication and Authorization

- Separate guard: `admin`
- Separate provider/model: `App\\Models\\Admin` (`admin_users` table)
- Middleware:
  - `auth:admin` for session-based admin auth
  - `admin.active` to block inactive admin accounts
  - `admin.permission:manage_users` for module-level permission control

### Domain and Service Layer

- `DashboardService`: aggregates admin dashboard metrics
- `UserAdminService`: user listing filters/pagination + activation/deactivation operations

### Data Model

- `admin_users`
  - `name`, `email`, `password`, `role`, `is_active`, `last_login_at`
- `users` extensions
  - `is_active`, `deactivated_at`

### UI Composition

- Base layout: `resources/views/layouts/admin.blade.php`
- Modules:
  - Dashboard: `resources/views/admin/dashboard/index.blade.php`
  - Users index: `resources/views/admin/users/index.blade.php`
  - User details/action page: `resources/views/admin/users/show.blade.php`
- Auth screen:
  - `resources/views/admin/auth/login.blade.php`

## User Management (Current Module)

### Capabilities

- View paginated users list
- Search by name/email
- Filter by status (active/inactive)
- View user details
- Activate/deactivate users

### Notes

- Status changes update `is_active` and `deactivated_at`
- This prepares backend governance without coupling to API frontend concerns

## Initial Admin Bootstrap

Environment variables:

- `ADMIN_DEFAULT_NAME`
- `ADMIN_DEFAULT_EMAIL`
- `ADMIN_DEFAULT_PASSWORD`
- `ADMIN_DEFAULT_ROLE`

Seeder:

- `Database\\Seeders\\AdminUserSeeder`

Run:

```bash
php artisan migrate
php artisan db:seed
```

## Scalability Strategy for Future Modules

Add each module with a consistent package:

1. Route group under `admin.<module>.*`
2. Controller(s) under `App\\Http\\Controllers\\Admin`
3. Service(s) under `App\\Services\\Admin`
4. Blade views under `resources/views/admin/<module>`
5. Permission key handled by `admin.permission:<ability>` middleware

Planned future modules: subscriptions, payments, CRM, support, audit logs.

## Testing

Feature tests added:

- `tests/Feature/Admin/AdminAuthenticationTest.php`
- `tests/Feature/Admin/UserManagementTest.php`

These cover auth gating, successful login, inactive admin blocking, user list access, and status toggles.
