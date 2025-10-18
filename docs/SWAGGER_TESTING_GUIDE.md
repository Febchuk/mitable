# Swagger API Testing Guide

This guide explains how to use Swagger UI to test the Mitable API, including how to authenticate and test protected endpoints.

---

## Table of Contents

1. [Accessing Swagger UI](#accessing-swagger-ui)
2. [Understanding the Interface](#understanding-the-interface)
3. [Testing Public Endpoints](#testing-public-endpoints)
4. [Getting an Access Token](#getting-an-access-token)
5. [Authorizing Swagger](#authorizing-swagger)
6. [Testing Protected Endpoints](#testing-protected-endpoints)
7. [Common Request Examples](#common-request-examples)
8. [Troubleshooting](#troubleshooting)
9. [Tips & Best Practices](#tips--best-practices)

---

## Accessing Swagger UI

### Development Environment

1. **Start the backend server**:
   ```bash
   npm run dev --workspace=apps/backend
   ```

2. **Open Swagger UI in your browser**:
   ```
   http://localhost:3000/api-docs
   ```

3. **Alternative**: View the raw OpenAPI spec:
   ```
   http://localhost:3000/api-docs.json
   ```

### Production Environment

```
https://api.mitable.app/api-docs
```

---

## Understanding the Interface

When you open Swagger UI, you'll see:

### Key Elements

1. **API Information** - Title, version, and description at the top
2. **Servers Dropdown** - Select between development and production servers
3. **Authorize Button** - Green button in the top-right (⚠️ Critical for protected routes!)
4. **Endpoint Groups** - Organized by tags (Authentication, Roadmaps, Nudges, etc.)
5. **Individual Endpoints** - Each shows HTTP method, path, and description

### Color Coding

- **🟢 Green (GET)** - Read data
- **🟡 Yellow (POST)** - Create new resource
- **🔵 Blue (PATCH)** - Partial update
- **🔴 Red (DELETE)** - Remove resource

### Lock Icons

- **🔓 Unlocked** - Public endpoint (no authentication required)
- **🔒 Locked** - Protected endpoint (requires authentication)

---

## Testing Public Endpoints

Public endpoints don't require authentication. These are perfect for testing Swagger functionality first.

### Example: Health Check

1. **Locate the endpoint**: Scroll to find `GET /health`
2. **Click** to expand the endpoint
3. **Click "Try it out"** button
4. **Click "Execute"** button
5. **View the response**:
   - Status code (should be `200`)
   - Response body with timestamp

### Example: Organization Signup

This is useful for creating test accounts.

1. **Find**: `POST /auth/signup-organization`
2. **Click "Try it out"**
3. **Edit the request body**:
   ```json
   {
     "email": "admin@example.com",
     "password": "Password123!",
     "firstName": "Jane",
     "lastName": "Smith",
     "organizationName": "Test Corp",
     "organizationDomain": "example.com"
   }
   ```
4. **Click "Execute"**
5. **Check the response**:
   - Status: `201 Created`
   - Response includes `user`, `session`, `organization`, and `profile`
   - **Important**: Copy the `access_token` from `session` object!

---

## Getting an Access Token

To test protected endpoints, you need a JWT access token. Here's how to get one:

### Method 1: Login with Existing User

1. **Find**: `POST /auth/login` endpoint
2. **Click "Try it out"**
3. **Enter credentials**:
   ```json
   {
     "email": "emily@lorikeet.ai",
     "password": "Password123!"
   }
   ```

   **Seeded Test Accounts** (from seed script):
   - **Employee**: `emily@lorikeet.ai` / `Password123!`
   - **Admin**: `sarah@lorikeet.ai` / `Password123!`

4. **Click "Execute"**
5. **Copy the access token**:
   - Look in the response body
   - Find `session.access_token`
   - Copy the entire JWT string (starts with `eyJ...`)

### Method 2: Signup New Organization

If you need admin privileges:

1. Use `POST /auth/signup-organization` (shown above)
2. This automatically creates an admin user and returns a session
3. Copy the `access_token` from the response

### Understanding the Token

A typical JWT token looks like:
```
eyJhbGciOiJIUzI1NiIsImtpZCI6Ik8yQ2s4OElNV1IvMnNPeDMi...
```

**Key Facts**:
- Token is valid for **1 hour** (3600 seconds)
- After expiration, use the `refresh_token` with `POST /auth/refresh`
- Tokens contain user info (id, email, role, organization)
- Never share tokens - they grant full access to user accounts

---

## Authorizing Swagger

Once you have an access token, you need to authorize Swagger to include it in requests.

### Step-by-Step Authorization

1. **Click the green "Authorize" button** (top-right of Swagger UI)

2. **A modal will appear** showing available security schemes:
   - `BearerAuth (http, Bearer)`

3. **In the "Value" field**, enter:
   ```
   Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Ik8yQ2s4OElNV1IvMnNPeDMi...
   ```

   ⚠️ **IMPORTANT**: Include the word `Bearer` followed by a space, then your token!

4. **Click "Authorize"** button in the modal

5. **Click "Close"**

### Verification

After authorizing:
- The "Authorize" button should show a **🔒 locked icon**
- Protected endpoints (with lock icons) will now include the Authorization header automatically
- You can click "Authorize" again to view/update the token

### Removing Authorization

To test unauthenticated requests:
1. Click "Authorize" button
2. Click "Logout" button
3. Click "Close"

---

## Testing Protected Endpoints

Now you can test endpoints that require authentication!

### Example: Get Current User Profile

1. **Verify you're authorized** (green lock icon on Authorize button)
2. **Find**: `GET /auth/me`
3. **Click "Try it out"**
4. **Click "Execute"**
5. **Review response**:
   - Status: `200 OK`
   - Response includes user profile with id, email, role, etc.

If you get `401 Unauthorized`, your token may be expired or incorrect.

### Example: Get User's Roadmap

1. **Find**: `GET /roadmaps`
2. **Click "Try it out"**
3. **Click "Execute"**
4. **Response includes**:
   - All weeks with tasks
   - Current week number
   - Completion percentages
   - Source materials for each task

### Example: Update Task Completion

1. **Find**: `PATCH /roadmaps/tasks/{taskId}`
2. **Click "Try it out"**
3. **Enter a taskId** (get one from the roadmap response above)
4. **Edit request body**:
   ```json
   {
     "completed": true
   }
   ```
5. **Click "Execute"**
6. **Response**:
   - Status: `200 OK`
   - Updated task with `completedAt` timestamp

---

## Common Request Examples

### Creating a Conversation

**Endpoint**: `POST /conversations`

**Request Body**:
```json
{
  "title": "Need help with development setup",
  "contextType": "help_request",
  "initialMessage": "I'm having trouble installing Node.js on my machine"
}
```

**Expected Response**: `201 Created` with conversation object including `id`

---

### Sending a Message

**Endpoint**: `POST /conversations/{conversationId}/messages`

**Parameters**:
- `conversationId`: UUID from created conversation

**Request Body**:
```json
{
  "role": "user",
  "content": "I'm getting an error when running npm install",
  "messageType": "text"
}
```

**Expected Response**: `201 Created` with message object

---

### Accepting a Nudge

**Endpoint**: `POST /nudges/{nudgeId}/accept`

**Parameters**:
- `nudgeId`: UUID from nudge list (get from `GET /nudges`)

**Request Body**: None (empty)

**Expected Response**: `200 OK` with updated nudge status and optional conversation link

---

### Getting All Templates (Admin Only)

**Endpoint**: `GET /admin/templates`

**Requirements**:
- Must be logged in as admin
- Uses Bearer token from admin user

**Expected Response**: `200 OK` with array of templates

**Permissions Error**: `403 Forbidden` if user is not admin

---

### Getting All Users (Admin Only)

**Endpoint**: `GET /admin/users`

**Requirements**: Admin role

**Expected Response**: List of all employees with:
- Name, email, role
- Start date and status
- Onboarding progress percentage
- Avatar URL

---

## Troubleshooting

### 401 Unauthorized

**Problem**: "Missing or invalid authorization header"

**Solutions**:
1. **Check if you've authorized Swagger**:
   - Click the "Authorize" button
   - Verify token is entered correctly
   - Ensure it starts with `Bearer ` (with space)

2. **Token may be expired**:
   - Tokens expire after 1 hour
   - Get a new token by logging in again
   - Or use `POST /auth/refresh` with your refresh token

3. **Wrong token format**:
   - ❌ Wrong: `eyJhbGciOiJIUzI1NiI...` (missing "Bearer ")
   - ✅ Correct: `Bearer eyJhbGciOiJIUzI1NiI...`

---

### 403 Forbidden

**Problem**: "Admin role required for this action"

**Cause**: You're trying to access an admin endpoint with an employee account

**Solution**:
1. **Logout from current token**:
   - Click "Authorize" → "Logout"
2. **Login with admin account**:
   - Use `POST /auth/login` with admin credentials
   - `sarah@lorikeet.ai` / `Password123!` (from seed data)
3. **Authorize with new token**

---

### 400 Bad Request

**Problem**: "Invalid request body" or "Validation error"

**Solutions**:
1. **Check required fields**:
   - Swagger marks required fields with red asterisks (*)
   - All required fields must be provided

2. **Check data types**:
   - Strings must be in quotes: `"text"`
   - Numbers without quotes: `123`
   - Booleans without quotes: `true` or `false`
   - UUIDs must match format: `"123e4567-e89b-12d3-a456-426614174000"`

3. **Check field formats**:
   - Email: Must be valid email format
   - Password: Minimum length requirements
   - Dates: ISO 8601 format (`2025-01-16T10:30:00Z`)

**Example Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

---

### 404 Not Found

**Problem**: "Resource not found"

**Causes**:
1. **Invalid ID in URL parameter**:
   - Check that the UUID exists
   - Copy IDs directly from previous responses

2. **Resource was deleted**

3. **Wrong endpoint path**

**Solution**: Use `GET` endpoints first to verify IDs:
- `GET /conversations` → get conversation IDs
- `GET /roadmaps` → get task IDs
- `GET /nudges` → get nudge IDs

---

### CORS Errors in Browser

**Problem**: Cross-Origin Request Blocked

**Note**: This shouldn't happen when using Swagger UI on the same domain

**If it occurs**:
- Verify backend CORS configuration
- Check `apps/backend/src/app.ts` has `app.use(cors())`
- Ensure you're accessing Swagger from `http://localhost:3000/api-docs`

---

## Tips & Best Practices

### 1. Start with Public Endpoints

Before dealing with authentication, test simple endpoints:
- `GET /health` - Verify server is running
- `POST /auth/login` - Get familiar with request bodies

### 2. Keep Your Token Handy

- Copy your access token to a text file or note-taking app
- You'll need to re-enter it if you refresh the page
- Tokens expire after 1 hour

### 3. Use "Try it out" Cancel Button

- If you accidentally click "Try it out", click "Cancel" to revert
- This prevents accidental executions

### 4. Check Response Schemas

Each endpoint shows:
- **Request Schema** - What data to send
- **Response Schema** - What data you'll receive
- **Example Values** - Sample requests/responses

Click "Schema" tab to see the structure.

### 5. Test with Different Roles

The seed script creates users with different roles:

**Employees** (role: "employee"):
- `emily@lorikeet.ai`
- `alex@lorikeet.ai`
- `jordan@lorikeet.ai`

**Admins** (role: "admin"):
- `sarah@lorikeet.ai`
- `marcus@lorikeet.ai`
- `david@lorikeet.ai`

All passwords: `Password123!`

Test admin-only endpoints with admin tokens, and regular endpoints with employee tokens.

### 6. Check the "Responses" Section

Before executing, scroll down to see:
- Possible status codes (200, 400, 401, 403, 404, 500)
- Response schemas for each status
- Example error responses

This helps you understand what to expect.

### 7. Use Developer Console

Open browser DevTools (F12) while using Swagger:
- **Network tab** - See actual HTTP requests/responses
- **Console tab** - View any JavaScript errors
- Helpful for debugging token issues

### 8. Understand Token Lifecycle

```
Login (POST /auth/login)
  ↓
Receive access_token (expires in 1 hour)
  ↓
Use token for protected endpoints
  ↓
Token expires (401 error)
  ↓
Refresh token (POST /auth/refresh with refresh_token)
  ↓
Receive new access_token
```

### 9. Copy IDs from Responses

Many endpoints require IDs (UUIDs) as parameters:
- Get roadmap → copy task IDs → use for updating tasks
- Get conversations → copy conversation ID → use for sending messages
- Get nudges → copy nudge ID → use for accepting/dismissing

### 10. Read Error Messages Carefully

Mitable API provides detailed error messages:
```json
{
  "error": "Bad Request",
  "message": "Email and password are required"
}
```

These messages tell you exactly what's wrong.

---

## Testing Workflow Example

Here's a complete workflow for testing the roadmap feature:

### Step 1: Login
```
POST /auth/login
→ Copy access_token from response
```

### Step 2: Authorize Swagger
```
Click "Authorize"
→ Enter: Bearer <access_token>
→ Click "Authorize" → "Close"
```

### Step 3: Get Roadmap
```
GET /roadmaps
→ View weeks, tasks, and completion percentages
→ Copy a task ID from response
```

### Step 4: Mark Task Complete
```
PATCH /roadmaps/tasks/{taskId}
→ Use copied task ID
→ Body: {"completed": true}
→ Execute
```

### Step 5: Verify Update
```
GET /roadmaps (again)
→ Check that task shows completed: true
→ Check completedAt timestamp
```

---

## Security Reminders

1. **Never share your access tokens** - They grant full access to your account
2. **Don't commit tokens to git** - Always keep them out of version control
3. **Use development tokens only in development** - Never use production tokens in development
4. **Tokens expire after 1 hour** - This is a security feature
5. **Logout when done** - Click "Authorize" → "Logout" in Swagger
6. **Test accounts only** - Use seed data accounts, not real user accounts

---

## Additional Resources

- **API Documentation**: See `docs/API_DOCUMENTATION.md` for complete endpoint reference
- **Database Schema**: See `docs/database_schema.md` for data structure
- **OpenAPI Spec**: View raw spec at `http://localhost:3000/api-docs.json`

---

## Quick Reference Card

### Authentication Flow
```
1. POST /auth/login → get access_token
2. Click "Authorize" → Bearer <token>
3. Test protected endpoints
4. If 401 error → refresh token or login again
```

### Common Endpoints to Test
```
Authentication:
  - POST /auth/login
  - POST /auth/signup-organization
  - GET /auth/me

Roadmaps:
  - GET /roadmaps
  - PATCH /roadmaps/tasks/{taskId}

Conversations:
  - GET /conversations
  - POST /conversations
  - POST /conversations/{id}/messages

Nudges:
  - GET /nudges
  - POST /nudges/{id}/accept
  - POST /nudges/{id}/dismiss

Admin:
  - GET /admin/users (admin only)
  - GET /admin/templates (admin only)
```

### Troubleshooting Quick Checks
```
❌ 401 Unauthorized → Check if authorized in Swagger
❌ 403 Forbidden → Need admin role
❌ 400 Bad Request → Check required fields
❌ 404 Not Found → Invalid ID in URL
```

---

## Need Help?

If you encounter issues not covered here:

1. Check the browser console (F12) for errors
2. Review the API documentation in `docs/API_DOCUMENTATION.md`
3. Verify your backend server is running: `npm run dev --workspace=apps/backend`
4. Check database connection in terminal logs

**Happy Testing!** 🚀
