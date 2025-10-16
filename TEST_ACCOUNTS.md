# Test Accounts

All test accounts have been seeded into the database with Supabase Auth credentials. Use these accounts to test the application with different roles and onboarding states.

**Standard Password for All Accounts**: `Password123!`

## Admin Accounts (3 users)

Admin users have access to the admin dashboard with analytics, user management, templates, and integrations.

| Email | Password | Name | Role |
|-------|----------|------|------|
| sarah@lorikeet.ai | Password123! | Sarah Chen | Admin |
| marcus@lorikeet.ai | Password123! | Marcus Johnson | Admin |
| david@lorikeet.ai | Password123! | David Kim | Admin |

## Employee Accounts (14 users)

Employee users have access to their personalized roadmap, nudges, and chat features.

### AI/ML Engineers

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| emily@lorikeet.ai | Password123! | Emily Rodriguez | Week 3 | AI/ML Engineer Onboarding (6 weeks) |
| alex@lorikeet.ai | Password123! | Alex Thompson | Week 1 | AI/ML Engineer Onboarding (6 weeks) |
| jordan@lorikeet.ai | Password123! | Jordan Lee | Week 5 | AI/ML Engineer Onboarding (6 weeks) |

### Backend Engineers

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| priya@lorikeet.ai | Password123! | Priya Patel | Week 2 | Engineering Onboarding (4 weeks) |
| carlos@lorikeet.ai | Password123! | Carlos Martinez | Week 4 | Engineering Onboarding (4 weeks) |

### Frontend Engineers

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| jessica@lorikeet.ai | Password123! | Jessica Wu | Week 3 | Engineering Onboarding (4 weeks) |
| miguel@lorikeet.ai | Password123! | Miguel Santos | Week 1 | Engineering Onboarding (4 weeks) |

### Product Managers

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| rachel@lorikeet.ai | Password123! | Rachel Green | Week 2 | Product Manager Onboarding (4 weeks) |
| james@lorikeet.ai | Password123! | James Wilson | Week 4 | Product Manager Onboarding (4 weeks) |

### Customer Success

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| sophie@lorikeet.ai | Password123! | Sophie Anderson | Week 2 | Customer Success Onboarding (3 weeks) |
| daniel@lorikeet.ai | Password123! | Daniel Brown | Week 3 | Customer Success Onboarding (3 weeks) |

### Sales

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| olivia@lorikeet.ai | Password123! | Olivia Davis | Week 1 | Sales Onboarding (3 weeks) |

### Design

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| ethan@lorikeet.ai | Password123! | Ethan Miller | Week 2 | Product Design Onboarding (3 weeks) |

### DevOps

| Email | Password | Name | Current Week | Roadmap Template |
|-------|----------|------|--------------|------------------|
| maya@lorikeet.ai | Password123! | Maya Johnson | Week 3 | Engineering Onboarding (4 weeks) |

## Testing Scenarios

### Test Admin Experience
1. Login with `sarah@lorikeet.ai / Password123!`
2. You'll be redirected to `/dashboard`
3. Explore:
   - Dashboard analytics
   - People management
   - Template creation
   - Integrations setup

### Test Early Employee Experience
1. Login with `alex@lorikeet.ai / Password123!` (Week 1, AI Engineer)
2. You'll be redirected to `/home`
3. Explore:
   - Week 1 tasks in Roadmap
   - Empty nudges (early stage)
   - Chat with AI assistant

### Test Mid-Stage Employee Experience
1. Login with `emily@lorikeet.ai / Password123!` (Week 3, AI Engineer)
2. You'll be redirected to `/home`
3. Explore:
   - Week 1-2 tasks marked as completed
   - Week 3 tasks in progress
   - Custom tasks (e.g., "Review PR for agent optimization")
   - Nudges for expert connections

### Test Late-Stage Employee Experience
1. Login with `jordan@lorikeet.ai / Password123!` (Week 5, AI Engineer)
2. You'll be redirected to `/home`
3. Explore:
   - Most tasks completed
   - Week 5-6 tasks in progress
   - Advanced conversations in chat

## Organization Details

- **Organization**: Lorikeet
- **Domain**: lorikeet.ai
- **Organization ID**: (Generated dynamically by seed script)

## Resetting Test Data

To reset all test accounts and data:

```bash
cd apps/backend
npm run db:seed
```

This will:
1. Delete all Supabase Auth users
2. Clear all database tables
3. Re-create 17 test accounts (3 admins + 14 employees)
4. Seed templates, tasks, and source materials
5. All accounts will use password: `Password123!`

## Notes

- All emails are auto-confirmed (no email verification required)
- Users have realistic avatar URLs from pravatar.cc
- Each employee has a personalized roadmap based on their role
- Tasks are marked as completed based on their current week
- Some users have custom tasks added by their managers
