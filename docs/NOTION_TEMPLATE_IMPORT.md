# Notion Template Import

Automatically create onboarding roadmap templates by pasting a Notion page URL. AI extracts tasks from the page content, eliminating manual entry.

**Status:** ✅ Implemented
**Test Coverage:** 34/34 tests passing

---

## How It Works

1. User pastes Notion URL when creating template
2. Backend fetches page blocks via Notion API
3. Gemini AI extracts structured tasks from content
4. Template created with tasks automatically

**Time saved:** ~10 minutes → 30 seconds per template

---

## Files Added

### `apps/backend/src/utils/gemini-schema.ts`
Converts Zod schemas to Gemini-compatible JSON Schema by stripping unsupported fields and handling nullable types.

**Key feature:** Transforms `type: ["string", "null"]` → `{type: "string", nullable: true}` for Gemini API compatibility.

### `apps/backend/src/utils/notion-url-parser.ts`
Extracts Notion page IDs from various URL formats.

**Test coverage:** 20 tests

### `apps/backend/src/services/llm.service.ts`
AI-powered task extraction using Gemini 1.5 Flash.

**Input:** Notion blocks with structure (headings, paragraphs, lists)
**Output:** Validated task objects matching database schema

**Features:**
- Identifies week numbers from headings
- Extracts time estimates from text
- Preserves task ordering
- Handles empty pages gracefully

**Test coverage:** 14 tests

---

## Files Modified

### `apps/backend/src/routes/admin.ts`
Added Notion import logic to template creation endpoint (~130 lines).

**Changes:**
- Extract page ID from `notionUrl` parameter
- Validate Notion integration connected
- Fetch page blocks
- Extract tasks with AI
- Assign to `req.body.tasks` for template creation

**Error codes:**
- `INVALID_NOTION_URL` - Malformed URL
- `NOTION_NOT_CONNECTED` - Integration not set up
- `NOTION_PAGE_NOT_ACCESSIBLE` - Page not shared
- `AI_EXTRACTION_FAILED` - AI processing error

### `apps/backend/package.json`
Added dependencies:
- `@google/generative-ai` - Gemini AI client
- `zod-to-json-schema` - Schema conversion

### `apps/backend/.env.example`
Updated placeholder values for OAuth credentials (cosmetic only).

---

## Tests

### `apps/backend/src/utils/notion-url-parser.test.ts`
- Valid URL formats
- Direct page IDs
- Edge cases (trailing slashes, special characters)
- Error cases (invalid URLs, malformed IDs)

### `apps/backend/src/services/llm.service.test.ts`
- Successful task extraction
- Empty input handling
- Invalid task filtering
- Error scenarios (invalid JSON, API failures)
- Block structure preservation

**Run tests:**
```bash
npm test --workspace=apps/backend
```

---

## Bug Fixes Applied

### Task Assignment Bug
**Issue:** Tasks extracted by Gemini weren't being inserted into database.

**Cause:** Variable destructuring created snapshot before LLM extraction. The loop referenced stale `tasks` variable instead of updated `req.body.tasks`.

**Fix:** Changed task insertion loop to reference `req.body.tasks` directly.

**Lines changed:**
- `apps/backend/src/routes/admin.ts:1393` - Check `req.body.tasks` instead of `tasks`
- `apps/backend/src/routes/admin.ts:1394` - Iterate over `req.body.tasks` instead of `tasks`

---

## Next Steps

### Planned Improvements
1. **Task review modal** - Let users preview/edit AI-extracted tasks before saving
2. **Batch task insertion** - Single query instead of N queries for better performance
3. **Better logging** - Remove debug logs, keep essential error tracking

### Future Enhancements
- Re-import from Notion to update existing templates
- Support for Google Docs, Confluence
- Custom AI prompts for extraction

---

## Quick Start

**Backend:**
```bash
npm install
npm run build --workspace=packages/shared
npm run dev
```

**Test Notion import:**
1. Connect Notion integration in app
2. Share Notion page with integration
3. Create new template with Notion URL
4. Verify tasks extracted correctly

---

## Dependencies

**New:**
- `@google/generative-ai@^0.21.0` - Gemini AI
- `zod-to-json-schema@^3.24.1` - Schema conversion

**Existing (no changes):**
- `GEMINI_API_KEY` environment variable
- Notion OAuth credentials
- Existing `notionService` for API calls
