## Watch Mode Verification Checklist

Use the following manual steps after modifying the selective capture pipeline to ensure we cover the critical scenarios mentioned in the implementation plan.

1. **Multi-window, same app selection**
   - Open two windows from the same application (e.g., two Chrome profiles).
   - Enter watch mode and select only one of the windows via the floating button; confirm only that button closes.
   - Capture a screenshot from the Agent pill and verify the result contains the selected window only.

2. **Blocked window feedback**
   - Mark an application as blocked in the capture policy (or use an already blocked app such as Notes).
   - Ensure the floating button renders with the blocked style and tooltip, and that clicking the button does not dispatch the select IPC event.

3. **Message send cleanup**
   - With watch mode enabled and at least one window selected, send a message through the Agent pill so the capture pipeline runs.
   - Confirm the capture request respects the selected window filter and that unselecting a window through the dropdown immediately removes it from the list and stops further captures of that window.

Record any deviations or unexpected behavior alongside reproduction details so we can iterate quickly.
