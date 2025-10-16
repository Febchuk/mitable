# Authentication Setup

## Overview

Mitable backend now has a complete authentication system using **Supabase Auth** with JWT token verification.

## What Was Implemented

### 1. **Supabase Client** (`src/lib/supabase.ts`)
- Admin client for elevated operations
- Standard client for RLS-respecting operations

### 2. **Auth Middleware** (`src/middleware/auth.ts`)
- `requireAuth` - Blocks unauthenticated requests (401)
- `optionalAuth` - Allows both authenticated and anonymous requests

### 3. **Auth Routes** (`src/routes/auth.ts`)
All routes under `/api/auth`:
- `POST /auth/signup` - Create new user account
- `POST /auth/login` - Sign in with email/password
- `POST /auth/logout` - Sign out current user
- `GET /auth/me` - Get current user profile
- `POST /auth/refresh` - Refresh access token

### 4. **Database Trigger** (Migration `0002_auth_trigger.sql`)
- Automatically creates user profile in `users` table when signing up
- Syncs Supabase Auth users with your database

### 5. **Protected Routes** (`src/routes.ts`)
Examples of protected and public routes:
- Protected: `/api/conversations`, `/api/help`, `/api/roadmaps`, `/api/nudges`
- Optional auth: `/api/public-data`

## Environment Variables

Add these to your `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://jfwtzxbqkrcscotpooke.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Optional, for admin operations
```

## Usage Examples

### Signup

```bash
POST http://localhost:3000/api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "firstName": "John",
  "lastName": "Doe",
  "organizationId": "uuid-of-organization"
}
```

### Login

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Response includes:
```json
{
  "user": { ... },
  "session": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "profile": { ... }
}
```

### Access Protected Route

```bash
GET http://localhost:3000/api/conversations
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Get Current User

```bash
GET http://localhost:3000/api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## How It Works

1. **User signs up** → Supabase Auth creates auth user → Database trigger creates profile in `users` table
2. **User logs in** → Supabase Auth returns JWT access token + refresh token
3. **Client stores tokens** → Include `Authorization: Bearer <access_token>` in requests
4. **Backend validates** → Middleware calls `supabase.auth.getUser(token)` to verify
5. **User attached to request** → Access via `req.user` and `req.userId`

## Security Best Practices

✅ **Always use `getUser()`** on the server (not `getSession()`)
✅ **Never expose service role key** to clients
✅ **Validate tokens on every request** (middleware does this)
✅ **Use HTTPS in production**
✅ **Store refresh tokens securely** on the client
✅ **Tokens auto-expire** (default: 1 hour)

## Testing

1. **Start the server:**
```bash
npm run dev
```

2. **Test with curl or Postman:**
```bash
# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@lorikeet.ai",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User",
    "organizationId": "<org-id-from-seed>"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@lorikeet.ai",
    "password": "password123"
  }'

# Access protected route
curl http://localhost:3000/api/conversations \
  -H "Authorization: Bearer <access_token>"
```

## Next Steps

- [ ] Add password reset functionality
- [ ] Add OAuth providers (Google, GitHub, etc.)
- [ ] Implement role-based permissions (admin vs employee)
- [ ] Add rate limiting for auth endpoints
- [ ] Set up email templates in Supabase dashboard

## Files Modified/Created

- ✅ `src/config.ts` - Added Supabase credentials
- ✅ `src/lib/supabase.ts` - Supabase client instances
- ✅ `src/middleware/auth.ts` - Authentication middleware
- ✅ `src/routes/auth.ts` - Auth endpoints
- ✅ `src/routes.ts` - Updated with auth middleware
- ✅ `src/db/migrations/0002_auth_trigger.sql` - User sync trigger
- ✅ `.env.example` - Environment variable template
- ✅ `package.json` - Added @supabase/supabase-js

## Troubleshooting

**"Missing authorization header"**
→ Include `Authorization: Bearer <token>` header in requests

**"Invalid or expired token"**
→ Token expired (1 hour default), use refresh endpoint

**"User profile not found"**
→ Database trigger may not have run, check migration status

**"Email already registered"**
→ User exists, try logging in instead
