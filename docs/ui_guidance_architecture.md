# UI Guidance Architecture: Just-In-Time, Iterative Model

## Overview

Mitable's UI guidance system provides step-by-step visual overlays to help users accomplish tasks across any application. Unlike traditional workflow systems that attempt to generate all steps upfront, our system uses a **just-in-time, iterative approach** that analyzes the current screen state and provides one step at a time.

## Core Principle: Screen-Based Reality

**The Fundamental Constraint:**
The AI can only guide users through UI elements it can actually see in the current screenshot. It cannot:

- See future screens the user hasn't navigated to yet
- Know what UI elements will appear after an action
- Predict the total number of steps required
- See elements in different applications or windows

**Why This Matters:**
If the AI tries to generate a complete workflow upfront (e.g., "Step 2 of 5"), it would be hallucinating future UI states. This leads to:

- Inaccurate coordinates for elements that don't exist yet
- Incorrect instructions for screens with different layouts
- Broken guidance when users have different permissions/settings
- No adaptability when users deviate from the expected path

## The Iterative Guidance Flow

### 1. Initial Request

```
User (in Agent pill): "How do I submit a PR in GitHub?"
```

### 2. Screenshot Analysis

- System captures current screen
- AI analyzes visible UI elements
- Extracts bounding boxes and labels
- Understands current application context

### 3. First Step Generation

```typescript
// AI returns single step only
{
  messageType: 'workflow',
  content: "Click the 'New Pull Request' button in the top right",
  cardData: {
    stepNumber: 1,  // Sequential, no "of 5"
    instruction: "Click 'New Pull Request'",
    targetElement: {
      label: "New Pull Request",
      boundingBox: { x: 1200, y: 150, width: 180, height: 40 }
    },
    highlightColor: "blue",
    arrowPosition: "top-right"
  }
}
```

### 4. Visual Presentation

**Overlay Window:**

- Displays arrow pointing to target element
- Shows highlight box around "New Pull Request" button
- Only shows current step (Step 1)

**Guide Window:**

- Shows instruction: "Click 'New Pull Request'"
- Displays as "Step 1" (no total count)
- No future steps listed yet

### 5. User Action

User performs the action (clicks button)
→ Screen changes to PR creation form

### 6. Continuation

User signals continuation in Agent pill:

- Explicit: "Done", "Next", "Okay"
- Implicit: "I don't see the description field" (follow-up question)
- Automatic: AI detects screen change in next message

### 7. Next Screenshot Analysis

- System captures NEW screen state
- AI analyzes NEW visible elements
- Compares to conversation history to understand progress

### 8. Next Step Generation

```typescript
{
  messageType: 'workflow',
  content: "Fill in the PR title and description",
  cardData: {
    stepNumber: 2,
    instruction: "Fill in the PR title and description",
    targetElement: {
      label: "PR Title Field",
      boundingBox: { x: 300, y: 200, width: 600, height: 50 }
    }
  }
}
```

### 9. Visual Update

**Overlay Window:**

- Clears previous arrow (Step 1 is done)
- Shows NEW arrow for Step 2 pointing to title field

**Guide Window:**

- Appends Step 2 below Step 1
- Shows Step 1 with checkmark (completed)
- Highlights Step 2 as current
- Scrollable history accumulates

### 10. Repeat Until Complete

Cycle continues until user achieves goal or exits workflow.

## Window Behaviors

### Agent Pill (Always Visible)

- User's primary interaction point
- Receives questions and continuation signals
- Takes screenshot on each message
- Maintains conversation context

### Overlay Window (Fullscreen Transparent)

- **Current Step Only**: Shows arrows/highlights for active step
- Clears when step completes
- Updates immediately when new step arrives
- No historical arrows (prevents visual clutter)
- Always click-through except for dismiss button

### Guide Window (Side Panel)

- **Accumulating History**: Shows all steps taken
- Each step rendered as card with:
  - Step number (1, 2, 3... no total)
  - Instruction text
  - Status: completed ✓, current (highlighted), or future (none yet)
- Scrollable list
- Auto-scrolls to current step
- Collapsible past steps to save space

## Conversation State Management

### Workflow Detection

The system tracks when a conversation becomes a workflow:

```typescript
conversation {
  id: "uuid",
  contextType: 'workflow',  // Changed from 'general'
  title: "How to submit a PR", // Generated from initial question
  userId: "uuid"
}
```

### Continuation Detection

**Explicit Signals:**

- "Done", "Next", "Continue", "Okay"
- "I completed that step"
- "What's next?"

**Implicit Signals:**

- Follow-up questions about current screen
- Error reports ("I don't see that button")
- Clarification requests

**Screen Change Detection:**

- Compare screenshot hash/key elements
- If significant change detected → likely progressed
- If no change → user might be stuck

### Workflow Completion

**User-Initiated:**

- "Thanks, I'm done"
- "I got it from here"
- Starts asking unrelated questions

**AI-Detected:**

- User confirms goal achieved
- Reaches typical endpoint (e.g., PR created confirmation)

**Action:** Conversation `contextType` returns to 'general'

## Multi-Application Workflows

The iterative model naturally handles workflows that span multiple applications:

```
Example: "How do I deploy the backend?"

Step 1: Screenshot shows VS Code → "Open terminal in VS Code"
Step 2: Screenshot shows terminal → "Run 'npm run build'"
Step 3: Screenshot shows terminal output → "Run './deploy.sh'"
Step 4: Screenshot shows browser → "Navigate to staging.example.com"
Step 5: Screenshot shows web app → "Verify the build number matches"
```

Each step adapts to whatever application is currently visible.

## Handling Deviations

### User Clicks Wrong Element

```
Expected: Click "New Pull Request"
Actual: User clicks "New Issue" instead

Next screenshot shows: Issue creation form
AI adapts: "It looks like you're creating an issue. To submit a PR instead,
            click the 'Pull Requests' tab at the top."
```

### Different Permissions/UI

```
Expected: "Click Settings in the sidebar"
User's screen: Sidebar doesn't have Settings (limited permissions)

AI adapts: "I don't see the Settings option on your screen. You may need admin
            permissions. Let me help you request access instead."
```

### Branching Paths

```
User: "How do I share this document?"

Step 1: "Click the Share button"
User clicks → Modal appears with two options: "Get Link" or "Invite People"

User chooses: "Get Link"
AI sees next screenshot: Link dialog
Step 2: "Click 'Copy Link' button"

OR

User chooses: "Invite People"
AI sees next screenshot: Email invite dialog
Step 2: "Enter email addresses in the field"
```

The AI naturally follows whichever path the user takes.

## Benefits of This Approach

### Accuracy

✅ Only describes UI elements that actually exist
✅ Provides real coordinates from current screen
✅ No hallucination of future states

### Adaptability

✅ Handles different user permissions/settings
✅ Adapts to UI changes or updates
✅ Follows user's chosen path in branching workflows

### Cross-Application

✅ Works across any application (Slack, GitHub, Figma, Terminal, etc.)
✅ No pre-mapping of every possible app required
✅ Seamlessly transitions between applications

### Self-Correcting

✅ Detects when user makes mistakes
✅ Provides corrective guidance based on actual state
✅ Doesn't get "stuck" following invalid plan

### Unknown Complexity

✅ Doesn't need to know total step count upfront
✅ Handles simple (2 steps) or complex (20 steps) equally well
✅ Adjusts difficulty based on user proficiency

## Technical Requirements

### Screenshot Capture

- Trigger on each user message in workflow context
- Capture full screen or active window
- Include multi-monitor support
- Respect user blacklist (excluded apps)

### UI Object Detection (Gemini Vision)

- Extract bounding boxes for interactive elements
- Label detection (button text, field labels)
- Application context recognition
- ~1-2 second processing time

### Coordinate Precision

- Account for DPI scaling
- Map coordinates to correct display
- <10 pixel accuracy for overlays
- Handle window repositioning

### State Management

- Track workflow context in conversation
- Store previous steps in message history
- Maintain screenshot references (temporary, 30 sec retention)
- Detect completion/abandonment

## Example Full Flow

**User Goal:** Submit expense report in internal tool

```
[Step 1]
User: "How do I submit an expense report?"
Screenshot: Dashboard with navigation menu
AI Response: "Click 'Expenses' in the left sidebar"
Overlay: Arrow pointing to Expenses menu item
Guide: "Step 1: Click 'Expenses' in the left sidebar"

[Step 2]
User: "Done"
Screenshot: Expenses page with "New Report" button
AI Response: "Click the 'New Report' button in the top right"
Overlay: Arrow pointing to New Report button
Guide: ✓ Step 1 | Step 2: Click 'New Report' button

[Step 3]
User: "Ok"
Screenshot: Expense form with fields
AI Response: "Fill in the expense date, amount, and category"
Overlay: Highlights date, amount, category fields
Guide: ✓ Step 1 | ✓ Step 2 | Step 3: Fill in expense details

[Step 4]
User: "I don't see a category dropdown"
Screenshot: Same form
AI Response: "The category field is below the amount. It's a dropdown
              labeled 'Expense Category'. Click it to see options."
Overlay: Highlights category dropdown specifically
Guide: Same Step 3, clarified

[Step 5]
User: "Got it, filled everything in"
Screenshot: Form filled, Submit button visible
AI Response: "Great! Now click the 'Submit for Approval' button at the bottom"
Overlay: Arrow pointing to Submit button
Guide: ✓ Step 1-3 | Step 4: Click 'Submit for Approval'

[Step 6]
User: "Done!"
Screenshot: Success confirmation page
AI Response: "Perfect! Your expense report has been submitted. You'll receive
              an email when it's approved."
Guide: ✓ All steps complete | Workflow ended
```

## Future Enhancements

### Planned Workflow Templates

For known internal processes, store workflow templates:

```typescript
workflowTemplate {
  id: "submit-expense-report",
  title: "Submit Expense Report",
  estimatedSteps: 4-6,  // Approximate range
  checkpoints: [
    "Expenses page loaded",
    "Form opened",
    "Form submitted"
  ]
}
```

Still deliver one step at a time, but use template to:

- Provide better initial estimation
- Detect if user is off-path
- Suggest shortcut tips

### Proactive Guidance

If user is on a known screen, suggest relevant help:

```
Overlay (subtle hint): "Need help? Press Cmd+H"
```

### Video Recording

Capture video of successful workflows to:

- Generate training materials
- Improve workflow templates
- Share with other team members

## Conclusion

The just-in-time, iterative UI guidance model provides accurate, adaptive, and self-correcting visual assistance by working with the reality of what's actually on screen. By analyzing one step at a time, the system avoids hallucination, handles complexity gracefully, and provides a superior user experience across any application or workflow.
