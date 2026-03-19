# Bug Tracking Guide for Testers

## Quick Start

1. **Found a bug?** Go to the GitHub Issues tab
2. Click **"New Issue"**
3. Choose the right template:
   - **Bug Report** - For unexpected behavior
   - **Crash Report** - For app crashes or freezes
   - **Performance/Latency** - For slow loading or lag

## How to Report Good Bugs

### What Makes a Good Bug Report?
✅ **Clear title** - "Login button doesn't work on Safari" (not "Button broken")
✅ **Steps to reproduce** - Numbered list of exactly what you did
✅ **Expected vs Actual** - What should happen vs what actually happens
✅ **Screenshots/Videos** - A picture is worth 1000 words
✅ **Device info** - Mac? Windows? Browser version?
✅ **Environment** - Did this happen in dev or production?

### Priority Levels
- **P0 - Critical**: App crashes, data loss, security issues, blocks all users
- **P1 - High**: Major feature broken, affects many users, workaround exists
- **P2 - Medium**: Minor issue, cosmetic, low impact

**When in doubt, mark it P1** - Engineers will re-prioritize if needed.

## Labels Explained

### Type Labels
- `bug` - Something doesn't work as expected
- `crash` - App crashes or freezes
- `latency` - Performance/speed issues
- `performance` - General performance problems

### Environment Labels
- `dev` - Found in dev/staging environment
- `production` - Found in live production app

### Status Labels
- `needs-triage` - New issue, not yet reviewed (auto-added)
- `confirmed` - Engineers confirmed this is a real bug
- `in-progress` - Someone is working on it
- `blocked` - Can't fix yet, waiting on something
- `wont-fix` - Decision made not to fix this

### Priority Labels
- `P0` - Critical
- `P1` - High priority
- `P2` - Medium priority

## Workflow for Testers

### 1. During Testing Session
- Keep notes as you test
- When you find something wrong, immediately create an issue
- Add as much detail as possible while it's fresh

### 2. Check for Duplicates
Before creating a new issue:
- Search existing issues to see if someone already reported it
- If duplicate exists, add your info as a comment instead

### 3. Follow Up
- Check your reported issues occasionally
- If a bug is marked "fixed", test it again to confirm

## Tips for Beta Testers

### Before Testing
- Know what version you're testing
- Clear your cache/data if asked
- Make sure you have good network connection

### While Testing
- Try to break things! That's your job
- Test edge cases (what if I tap really fast? What if I use symbols in my name?)
- Try different scenarios (slow network, low battery, etc.)

### Reporting
- Don't worry about being "too picky" - report everything weird
- Even if you're not sure it's a bug, report it anyway
- Multiple reports of the same bug help us see patterns

## Common Scenarios

### "I found multiple bugs in one testing session"
✅ Create separate issues for each bug
❌ Don't create one issue with 5 different bugs listed

### "This bug seems similar to another one"
✅ Mention the related issue: "Similar to #123 but happens on iOS instead"
✅ Still create a separate issue unless it's identical

### "I'm not sure if this is a bug or a feature"
✅ Report it anyway! Engineers will clarify
✅ Label it `needs-triage` and mention your uncertainty

### "The app crashed"
✅ report it! Describe what you were doing
✅ Note if it's reproducible or random

## For the PMs

### Triage Process (Do this daily)
1. Review all `needs-triage` issues
2. Add appropriate labels (environment, priority)
3. Assign to engineers if clear owner
4. Close obvious duplicates
5. Ask for more info if report is unclear

### Weekly Review
- Count: How many bugs found this week?
- By type: Crashes vs bugs vs performance
- By priority: How many P0/P1/P2?
- Trends: Are we finding more or fewer bugs?

### Before Release
- Filter: Show only `production` + `P0` or `P1` bugs
- Verify: All critical bugs are fixed or have workarounds
- Document: Known issues for release notes

## Quick Reference

### Useful GitHub Filters

**All open bugs:**
`is:issue is:open`

**All crashes:**
`is:issue is:open label:crash`

**All P0 bugs:**
`is:issue is:open label:P0`

**All production bugs:**
`is:issue is:open label:production`

**My reported bugs:**
`is:issue author:@me`

**Bugs waiting for triage:**
`is:issue is:open label:needs-triage`

Save these as custom filters in GitHub!

## Questions?

If you're stuck or not sure how to report something, just ask! Better to over-communicate than under-report.

**Remember: Finding bugs before users do is the goal. You're helping make the product better!** 🎯
