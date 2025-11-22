# Production Rollback Procedure

## When to Rollback

Rollback production when:

- ❌ Production health check fails after deployment
- ❌ Critical functionality is broken
- ❌ Database migrations caused data corruption
- ❌ API is returning 500 errors
- ❌ Users cannot access the application

## Before You Start

**Quick Checks:**

1. Verify production is actually broken:

   ```bash
   curl https://mitablebackend-production.up.railway.app/health
   ```

2. Check Railway deployment logs:

   ```bash
   railway logs --deployment latest
   ```

3. Identify the bad commit:
   ```bash
   git log --oneline -10
   ```

## Rollback Methods

### Method 1: Railway CLI (FASTEST - Recommended)

**Time to rollback:** <1 minute

**Steps:**

1. **Install Railway CLI** (if not already installed):

   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**

   ```bash
   railway login
   ```

3. **View recent deployments:**

   ```bash
   railway list --deployments
   ```

4. **Rollback to previous deployment:**

   ```bash
   railway rollback
   ```

   Or rollback to specific deployment:

   ```bash
   railway rollback --deployment <deployment-id>
   ```

5. **Verify rollback succeeded:**

   ```bash
   curl https://mitablebackend-production.up.railway.app/health
   # Should return HTTP 200
   ```

6. **Check logs:**
   ```bash
   railway logs
   ```

**Pros:**

- ✅ Fastest method (<1 minute)
- ✅ No git history changes
- ✅ Easy to roll forward again if needed
- ✅ Railway handles everything

**Cons:**

- ⚠️ Requires Railway CLI installed
- ⚠️ Doesn't fix the bad code in git (still in main branch)

---

### Method 2: Git Revert (SAFEST - Recommended for team)

**Time to rollback:** 2-3 minutes

**Steps:**

1. **Find the bad commit:**

   ```bash
   git log --oneline -10
   # Look for the commit that broke production
   ```

2. **Revert the commit:**

   ```bash
   git revert <bad-commit-hash>

   # Or revert last commit
   git revert HEAD
   ```

3. **Push revert commit:**

   ```bash
   git push origin main
   ```

4. **Wait for Railway to deploy** (2-3 minutes):
   - Railway automatically detects the push
   - Deploys the revert commit
   - Production Deploy workflow runs health check

5. **Verify deployment:**

   ```bash
   # Wait for deployment to complete, then:
   curl https://mitablebackend-production.up.railway.app/health
   ```

6. **Monitor GitHub Actions:**
   - Go to: https://github.com/Febchuk/mitable/actions
   - Verify "Production Deploy" workflow passes

**Pros:**

- ✅ Creates clear audit trail in git history
- ✅ Team can see what was reverted and why
- ✅ Preserves all git history
- ✅ Uses standard CI/CD pipeline

**Cons:**

- ⚠️ Takes 2-3 minutes (slower than Railway rollback)
- ⚠️ Adds extra commit to history

---

### Method 3: Git Reset + Force Push (DANGEROUS - Use with caution)

**Time to rollback:** 1-2 minutes

**⚠️ WARNING:** This rewrites git history. Only use if:

- You're the only one working on the project
- No one has pulled the bad commit yet
- The bad commit contains sensitive data that must be removed

**Steps:**

1. **Find the last good commit:**

   ```bash
   git log --oneline -10
   # Identify the commit before the bad one
   ```

2. **Reset to good commit (LOCAL ONLY):**

   ```bash
   git reset --hard <good-commit-hash>
   ```

3. **Force push (REWRITES HISTORY):**

   ```bash
   git push origin main --force
   ```

4. **Verify deployment:**
   ```bash
   # Wait 2-3 minutes for Railway deployment
   curl https://mitablebackend-production.up.railway.app/health
   ```

**Pros:**

- ✅ Cleanest git history (bad commit disappears)
- ✅ Removes sensitive data if needed

**Cons:**

- ❌ Rewrites git history (dangerous)
- ❌ Can cause issues for other developers
- ❌ Can't easily undo the force push
- ❌ Bypasses branch protection (requires admin override)

---

## After Rollback

### 1. Verify Production Health

```bash
# Check health endpoint
curl https://mitablebackend-production.up.railway.app/health
# Expected: HTTP 200 with {"status":"ok"}

# Check Railway deployment status
railway status

# Check logs for errors
railway logs --tail 100
```

### 2. Notify Team

Post in Slack/Discord/Email:

```
🚨 PRODUCTION ROLLBACK EXECUTED

Reason: [Brief description of the issue]
Method: [Railway CLI / Git Revert / Git Reset]
Rolled back to: [commit hash or deployment ID]
Status: Production is now stable

Action items:
- [ ] Investigate root cause
- [ ] Fix the issue in a new PR
- [ ] Add tests to prevent recurrence
```

### 3. Investigate Root Cause

**Ask these questions:**

1. **What broke?**
   - Check error logs
   - Review failed health checks
   - Check Railway deployment logs

2. **Why did CI not catch it?**
   - Missing tests?
   - Preview environment different from production?
   - Environment variable mismatch?

3. **How do we prevent this?**
   - Add integration tests
   - Improve health checks
   - Better preview environment parity

**Document findings:**

- Create GitHub issue describing the incident
- Link to the bad commit
- List action items for prevention

### 4. Fix and Redeploy

**Proper fix workflow:**

1. Create new branch:

   ```bash
   git checkout -b fix/production-issue
   ```

2. Fix the issue (with tests!)

3. Test thoroughly in preview deployment

4. Get code review

5. Merge and monitor deployment closely

---

## Rollback Decision Matrix

| Situation                        | Recommended Method          | Estimated Time |
| -------------------------------- | --------------------------- | -------------- |
| **Quick rollback needed**        | Railway CLI                 | <1 min         |
| **Team collaboration**           | Git Revert                  | 2-3 min        |
| **Sensitive data leaked**        | Git Reset (with caution)    | 1-2 min        |
| **Database migration issue**     | Railway CLI + manual DB fix | 5-10 min       |
| **Partial functionality broken** | Git Revert specific commit  | 2-3 min        |

---

## Database Rollback (Special Case)

If a database migration broke production:

### 1. Rollback Application

Use Railway CLI or Git Revert (as above)

### 2. Rollback Database Migration

**⚠️ DANGER ZONE - Database operations are risky**

**Option A: Drizzle Migration Rollback**

```bash
# Connect to production database
export DATABASE_URL="<production-direct-url>"

# Check migration history
npm run db:studio

# Manually revert migration SQL (if reversible)
# You'll need to write reverse migration manually
```

**Option B: Restore from Backup**

If you have Supabase backups:

1. Go to Supabase Dashboard → Database → Backups
2. Select backup from before the bad migration
3. Restore backup (creates new database instance)
4. Update DATABASE_URL in Railway to point to restored database

**Option C: Manual Data Fix**

If migration only affected specific tables:

1. Connect to database with `psql` or Drizzle Studio
2. Manually undo the changes (requires SQL knowledge)
3. Verify data integrity

**⚠️ ALWAYS test database rollbacks in dev environment first!**

---

## Prevention Checklist

After each rollback incident, review this checklist:

- [ ] **Missing Tests**: Add tests that would have caught this
- [ ] **Preview Parity**: Ensure preview environment matches production
- [ ] **Health Checks**: Improve health checks to catch this type of failure
- [ ] **Monitoring**: Add alerts for this type of issue
- [ ] **Documentation**: Document the gotcha for future reference
- [ ] **Code Review**: Was code review thorough enough?
- [ ] **Migration Safety**: Did we test migration rollback?

---

## Emergency Contacts

| Role                 | Contact  | Responsibility            |
| -------------------- | -------- | ------------------------- |
| **Production Owner** | @febchuk | Final rollback decision   |
| **Database Admin**   | TBD      | Database rollback/restore |
| **DevOps Lead**      | TBD      | Railway infrastructure    |

---

## Useful Commands Reference

```bash
# Check production health
curl https://mitablebackend-production.up.railway.app/health

# View Railway logs
railway logs
railway logs --tail 100
railway logs --deployment <id>

# List Railway deployments
railway list --deployments

# Rollback Railway deployment
railway rollback
railway rollback --deployment <id>

# View recent git commits
git log --oneline -10

# Revert last commit
git revert HEAD

# View Railway status
railway status

# View GitHub Actions runs
gh run list --limit 10
gh run view <run-id>

# View branch protection status
gh api repos/Febchuk/mitable/branches/main/protection
```

---

## Additional Resources

- [Railway Docs - Rollbacks](https://docs.railway.app/deploy/rollbacks)
- [Git Revert vs Reset](https://www.atlassian.com/git/tutorials/undoing-changes)
- [Supabase Backup and Restore](https://supabase.com/docs/guides/database/backups)
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development workflow
- [CI/CD Implementation Plan](../CICD_IMPLEMENTATION_PLAN.md)
