# Frontend Guide: Profile Management Integration

## Goal

Implement a complete profile management UI using backend APIs only. This guide covers both management dashboards (owner/admin/supervisor) and agent dashboards.

All profile APIs are authenticated and operate on the current user only.

## Endpoints

Base prefix: `/api/v1`

1. GET `/user/profile`
2. PATCH `/user/profile`
3. POST `/user/profile/avatar`
4. GET `/avatars` (existing avatar catalog endpoint)

## Auth

Use Bearer token from login flow.

Example header:

```http
Authorization: Bearer <token>
Accept: application/json
```

## Company Context

Profile APIs support optional `company_id` context in query/body.

Accepted values:

1. Numeric internal company ID.
2. Public company key (example: `FAC-ABC-001`), case-insensitive.

If omitted, backend resolves the latest active membership.

If provided and user is not attached to that company, API returns validation error on `company_id`.

## 1) Get Profile

### Request

```http
GET /api/v1/user/profile?company_id=FAC-ABC-001
```

### Response Shape

```json
{
  "success": true,
  "message": "Profile fetched successfully.",
  "data": {
    "identity": {
      "id": 12,
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "phone_number": "+2348012345678",
      "gender": "female",
      "avatar_key": "avatar_1",
      "avatar_url": "https://api.thefactory23.com/storage/avatar/female/avatar_1.png",
      "avatar_source": "catalog"
    },
    "organization": {
      "company": {
        "id": 4,
        "company_id": "FAC-ABC-001",
        "name": "Acme Ltd",
        "status": "active",
        "team_size": "11-50",
        "country": "NG",
        "purpose": "Team operations"
      },
      "assigned_company": {
        "id": 4,
        "company_id": "FAC-ABC-001",
        "name": "Acme Ltd"
      },
      "membership": {
        "relation": "company_users",
        "role": "owner",
        "joined_at": "2026-05-19 08:11:20",
        "department": null
      },
      "role": "owner",
      "internal_role": null,
      "user_type": "self-serve"
    },
    "account": {
      "email_verified": true,
      "onboarding": {
        "completed": true,
        "self_serve_completed": true,
        "enterprise_completed": false,
        "internal_completed": false,
        "self_serve_completed_at": "2026-05-19T08:00:00+00:00",
        "enterprise_completed_at": null,
        "internal_completed_at": null
      },
      "onboarding_status": null,
      "status": "active",
      "is_active": true,
      "created_at": "2026-05-18T13:30:00+00:00",
      "updated_at": "2026-05-19T08:11:20+00:00"
    },
    "permissions": {
      "can_edit_name": true,
      "can_edit_phone_number": true,
      "can_edit_gender": true,
      "can_edit_country": true,
      "can_edit_email": false,
      "can_edit_role": false,
      "can_edit_company": false,
      "can_edit_membership": false
    }
  },
  "errors": null
}
```

## 2) Update Profile

### Request

```http
PATCH /api/v1/user/profile
Content-Type: application/json
```

```json
{
  "company_id": "FAC-ABC-001",
  "name": "Jane K. Doe",
  "phone_number": "+2348111111111",
  "gender": "female",
  "country": "US"
}
```

### Editable Fields

1. `name`
2. `phone_number`
3. `gender`
4. `country` (role-restricted)

### Non-editable Fields

Backend rejects these if sent:

1. `email`
2. `role`
3. `internal_role`
4. `user_type`
5. `membership_role`

### Country Rule

`country` updates company country and is allowed only for `owner` and `admin` memberships.

Agents and supervisors receive validation error.

## 3) Update Avatar / Profile Image

### Request A: Select Existing Avatar Key

```http
POST /api/v1/user/profile/avatar
Content-Type: application/json
```

```json
{
  "company_id": "FAC-ABC-001",
  "avatar_key": "avatar_1",
  "gender": "female"
}
```

### Request B: Upload Custom Image

`multipart/form-data`

Fields:

1. `company_id` (optional context)
2. `avatar_file` (required when uploading)
3. `gender` (optional)

### Validation Rules

1. Must provide exactly one of: `avatar_key` OR `avatar_file`.
2. `avatar_file` must be image type: `jpeg`, `jpg`, `png`, `webp`.
3. Max upload size: 5MB.
4. If avatar key is invalid or gender mismatch occurs, backend returns validation errors.

### Storage Behavior

1. Catalog avatar selection stores `avatar_key` on user.
2. Custom upload stores file under `storage/app/public/avatar/custom/...`.
3. Backend removes previous custom image when replaced.
4. `avatar_url` is always returned for rendering.

## Existing Avatar Catalog API

Use existing endpoint:

```http
GET /api/v1/avatars?gender=male&limit=12&cursor=0
```

Response includes:

1. `key`
2. `url`
3. `svg` (when available)
4. pagination metadata

## Frontend Screen Structure

Suggested profile page sections:

1. Identity
2. Organization
3. Account
4. Profile image controls

### Identity Section

Display:

1. Full name
2. Email (read-only)
3. Phone number
4. Gender
5. Current avatar/image

### Organization Section

Display:

1. Company name
2. Company ID
3. Role
4. User type
5. Team size
6. Country
7. Purpose
8. Membership relation + joined date

### Account Section

Display:

1. Email verification state
2. Onboarding status
3. Account status (`active`, `suspended`, `deactivated`)
4. Created/updated timestamps

## Role Handling in UI

Use `permissions` object from profile response.

1. Management dashboards should enable fields where permission is true.
2. Agent dashboard should keep company/org fields read-only.
3. Keep email, role, membership, and company ID read-only for all roles.

## Image Flow

### Avatar Selection Flow

1. User picks gender.
2. Frontend fetches `/avatars?gender=<gender>`.
3. User selects avatar key.
4. Frontend calls `POST /user/profile/avatar` with `avatar_key`.

### Custom Upload Flow

1. User chooses image file.
2. Frontend sends multipart request to `POST /user/profile/avatar` with `avatar_file`.
3. Replace displayed image with returned `data.identity.avatar_url`.

## Error Handling

Validation errors are returned in `errors` with field keys.

Handle these specifically:

1. `company_id`
2. `country`
3. `avatar`
4. `avatar_key`
5. `avatar_file`

## Recommended Integration Sequence

1. Load profile via `GET /user/profile` on profile page mount.
2. Bind editable inputs based on `permissions`.
3. Submit identity/company updates through `PATCH /user/profile`.
4. Handle avatar updates separately with `POST /user/profile/avatar`.
5. Refresh profile after successful mutations to keep state in sync.
