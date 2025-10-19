# Notion Service Account Setup

## Problem
Notion OAuth only allows the original authorizer to reconnect and modify page permissions. This creates a single point of failure when that admin is unavailable.

## Solution: Service Account

Use a dedicated "service" Notion account that all admins have access to, rather than using personal admin accounts.

---

## Setup Instructions

### 1. Create Service Account

1. Go to https://notion.so/signup
2. Create account: `mitable-integration@yourcompany.com` (or similar)
3. Use a strong password and store in team password manager (1Password, LastPass, etc.)
4. Enable 2FA if required by your organization

### 2. Add to Notion Workspace

1. Log into your main Notion workspace as an existing admin
2. Go to Settings & Members → Members
3. Invite `mitable-integration@yourcompany.com`
4. Grant **Admin** access level

### 3. Disconnect Current Integration

**In Mitable Admin Panel:**
1. Go to Integrations → Notion
2. Click "Disconnect"
3. Confirm disconnection

**In Database (if needed):**
```sql
-- Check current integration
SELECT * FROM integrations WHERE provider = 'notion';

-- Delete it
DELETE FROM integrations 
WHERE organization_id = 'your-org-id' AND provider = 'notion';
```

### 4. Reconnect Using Service Account

1. **Log out** of your personal Notion account in your browser
2. **Log in** to `mitable-integration@yourcompany.com` in Notion
3. In Mitable admin panel:
   - Go to Integrations → Notion
   - Click "Connect"
   - Complete OAuth flow
   - Select pages to share
4. Verify connection is successful

### 5. Share Credentials with Team

1. Store service account credentials in your team password manager
2. Document the location in your team wiki/docs
3. Give all admins access to the credentials

---

## Usage

### Adding/Removing Pages

**Any admin can now:**
1. Access the service account credentials from password manager
2. Log into Notion as `mitable-integration@yourcompany.com`
3. Go to Mitable admin panel
4. Navigate to Integrations → Notion → Configure
5. Click "Reconnect to Add/Remove Pages"
6. Select/deselect pages as needed
7. Click "Sync Now"

### Best Practices

- **Log in via incognito window** to avoid conflicts with personal Notion accounts
- **Keep credentials secure** - only give access to trusted admins
- **Document changes** - note which pages were added/removed and why
- **Regular audits** - review shared pages quarterly

---

## Troubleshooting

### "Client Secret Error" when reconnecting
- Ensure you're logged into the **service account**, not your personal account
- Check browser cookies - clear if needed
- Try incognito mode

### Integration shows as "Connected" but no pages appear
- The service account needs **Full Access** permission to pages
- Share pages explicitly with the service account in Notion
- Wait a few minutes and click "Sync Now"

### Token expired
- Reconnect through the service account
- Backend will automatically refresh the token

---

## Alternative Approaches

If service account doesn't work for your organization:

### Option A: Multiple Integrations
Store one integration per admin in database. Modify schema to track `userId`.

### Option B: Internal Integration
Switch to Internal Integration type - any admin can share pages from Notion UI without OAuth.

### Option C: Request System
Build a request/approval workflow where non-owner admins request page access from the owner.

---

## Security Considerations

✅ **DO:**
- Use a strong, unique password
- Enable 2FA on the service account
- Store credentials in encrypted password manager
- Rotate password periodically
- Audit access logs

❌ **DON'T:**
- Share credentials in plain text (Slack, email)
- Use a personal email for the service account
- Give access to non-admin employees
- Hardcode credentials in source code

---

## References

- [Notion OAuth Documentation](https://developers.notion.com/docs/authorization)
- [Notion Reauthorization Limitations](https://developers.notion.com/changelog/initial-users-may-reauthorize-a-public-integration-using-oauth)
- [Mitable Integration Guide](./NOTION_INTEGRATION.md)
