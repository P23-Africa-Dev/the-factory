# Feature Name

## Feature Overview

Describe what the feature does and why the frontend would call it.

## API Endpoints

### Endpoint Name

- URL: `/api/v1/example`
- Method: `GET`

## Authentication Requirements

- Authentication: Required or not required
- Authorization: Describe roles, scopes, policies, or access rules

## Request Structure

### Headers

| Header | Required | Value |
| --- | --- | --- |
| `Accept` | Recommended | `application/json` |

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | integer | Yes | Resource identifier |

### Query Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `page` | integer | No | Pagination page |

### Request Body

```json
{
  "example": "value"
}
```

## Validation Rules

| Field | Rules |
| --- | --- |
| `example` | `required|string|max:255` |

## Response Structure

### Success Response

Status: `200 OK`

```json
{
  "success": true,
  "message": "Request completed successfully.",
  "data": {},
  "errors": null
}
```

### Error Response

Status: `422 Unprocessable Entity`

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "example": [
      "The example field is required."
    ]
  }
}
```

## Status Codes And Error Messages

| Status Code | Meaning | Notes |
| --- | --- | --- |
| `200` | Success | Request completed successfully |
| `401` | Unauthorized | Authentication required or invalid |
| `403` | Forbidden | Authenticated but not allowed |
| `404` | Not found | Resource does not exist |
| `422` | Validation failed | Request data is invalid |
| `500` | Server error | Unexpected backend error |

## Example Requests

### cURL

```bash
curl --request GET \
  --url http://localhost:8080/api/v1/example \
  --header 'Accept: application/json'
```

## Frontend Integration Notes

Add pagination, filtering, auth, caching, retry, or UX notes relevant to frontend implementation.

## Breaking Changes

- None currently.