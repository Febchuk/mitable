# Mitable AI Onboarding Buddy - MVP Completion Tasks

**Current Status:** 65-70% Complete  
**Target:** 100% MVP Ready for Beta Launch  
**Estimated Timeline:** 6-8 weeks  
**Document Version:** 1.0  
**Created:** 2025-10-22

---

## Executive Summary

This document provides detailed tasks and acceptance criteria to complete the remaining 30-35% of the Mitable MVP. Tasks are organized by priority phases, with each task including implementation details, acceptance criteria, testing requirements, and dependencies.

**Critical Path:** Visual Guidance System → Knowledge Base → Security → Production Readiness

---

## Phase 1: Visual Guidance System (Core Value Proposition)
**Priority:** CRITICAL  
**Timeline:** Weeks 1-2  
**Current Status:** 15% Complete  
**Impact:** Unlocks primary product differentiation

### Task 1.1: Implement Screenshot Capture System

**Description:** Build native screenshot capture functionality using Electron's `desktopCapturer` API to capture the active application window or full screen when user invokes help (Cmd+H).

**Location:** `/apps/electron/src/main.ts` and new service `/apps/electron/src/services/captureService.ts`

**Technical Requirements:**
- Use `desktopCapturer.getSources()` to capture screens and windows
- Capture at high DPI (Retina support for macOS)
- Convert to PNG buffer for transmission
- Limit capture size to 1920x1080 max (resize if larger)
- Include window title and bounds in metadata
- Handle multi-monitor scenarios
- Support both full screen and active window capture

**Implementation Steps:**
1. Create `captureService.ts` with methods:
   - `captureActiveWindow()`: Captures the currently focused window
   - `captureFullScreen()`: Captures primary display
   - `captureRegion(bounds)`: Captures specific coordinates
2. Add IPC handler `SCREENSHOT_CAPTURE` in main process
3. Integrate with Agent window's help button
4. Store screenshot in temp directory with unique ID
5. Send screenshot path + metadata to backend via IPC

**Acceptance Criteria:**
- [ ] Cmd+H triggers screenshot capture within 500ms
- [ ] Screenshots captured at native resolution (up to 1920x1080)
- [ ] Retina/HiDPI displays handled correctly
- [ ] Both macOS and Windows supported
- [ ] Screenshot includes accurate window bounds metadata
- [ ] Failed captures show user-friendly error message
- [ ] Screenshots auto-deleted after 5 minutes or session end
- [ ] Memory usage stays under 100MB during capture
- [ ] Multi-monitor setups capture correct screen
- [ ] User receives visual/audio feedback when capture succeeds

**Testing Requirements:**
- Test on macOS (Intel and Apple Silicon)
- Test on Windows 10 and 11
- Test with multiple monitors (2 and 3 displays)
- Test with different DPI settings (100%, 125%, 150%, 200%)
- Test capture speed under system load
- Test memory cleanup after 100 consecutive captures
- Test with maximized, windowed, and fullscreen apps

**Dependencies:**
- None (can start immediately)

**Estimated Effort:** 3-4 days

---

### Task 1.2: Integrate Gemini Vision API for UI Detection

**Description:** Implement UI element detection using Google Gemini Vision API to analyze screenshots and identify interactive elements (buttons, inputs, links, etc.) with their bounding boxes.

**Location:** `/apps/backend/src/services/visionService.ts` (expand existing scaffold)

**Technical Requirements:**
- Use Gemini 2.0 Flash with vision capabilities
- Send screenshot as base64-encoded image
- Prompt engineering for UI element detection
- Return structured JSON with detected elements
- Each element should include: type, text/label, bounding box (x, y, width, height), confidence score
- Support detection of: buttons, text inputs, dropdowns, links, icons, tabs, modals
- Implement retry logic with exponential backoff
- Cache results for 30 seconds (same screenshot)
- Handle API rate limits gracefully

**Prompt Template:**
```
Analyze this screenshot of a desktop application interface. Identify all interactive UI elements and return them in JSON format.

For each element, provide:
- type: (button|input|dropdown|link|icon|tab|modal|text|image)
- label: visible text or aria-label
- bounds: {x, y, width, height} in pixels from top-left
- confidence: 0.0-1.0 score
- description: brief context about the element

Focus on interactive elements users might need help with. Ignore decorative elements.

Return ONLY valid JSON, no markdown:
{
  "elements": [
    {"type": "button", "label": "Save", "bounds": {"x": 100, "y": 200, "width": 80, "height": 32}, "confidence": 0.95, "description": "Primary save button in toolbar"}
  ],
  "screenshot_context": "Brief description of what application/page this appears to be"
}
```

**Implementation Steps:**
1. Expand `visionService.ts` with `detectUIElements(imageBuffer)` method
2. Add image preprocessing (resize, compress if needed)
3. Implement Gemini API call with vision model
4. Parse and validate JSON response
5. Transform coordinates to match original screenshot dimensions
6. Add confidence threshold filtering (>0.7)
7. Implement caching with LRU cache (max 10 screenshots)
8. Add comprehensive error handling
9. Create POST `/api/vision/detect` endpoint
10. Add unit tests with mock responses

**Acceptance Criteria:**
- [ ] API successfully detects buttons with >85% accuracy
- [ ] API successfully detects text inputs with >80% accuracy
- [ ] API successfully detects links with >80% accuracy
- [ ] Response time under 3 seconds for typical screenshots
- [ ] Bounding boxes accurate within 10 pixels
- [ ] Confidence scores properly calibrated
- [ ] Handles rate limits without crashing
- [ ] Returns graceful errors for invalid images
- [ ] Caching reduces API calls by >70% for repeat requests
- [ ] Works with dark mode and light mode interfaces
- [ ] Supports both macOS and Windows UI patterns
- [ ] Returns empty array (not error) for non-UI screenshots

**Testing Requirements:**
- Test with 20+ different application screenshots
- Test with various UI frameworks (Electron, web, native)
- Test with different color schemes and themes
- Test with cluttered vs minimal interfaces
- Test with overlapping elements
- Test with partially visible elements
- Test API timeout scenarios
- Test with corrupted/invalid images
- Benchmark detection accuracy with labeled dataset
- Load test with 100 concurrent requests

**Dependencies:**
- Task 1.1 (Screenshot Capture) must be complete
- Gemini API key in environment variables

**Estimated Effort:** 5-6 days

---

### Task 1.3: Build Overlay Rendering System

**Description:** Implement visual overlay rendering in the Overlay Window to display arrows, highlights, and tooltips pointing to detected UI elements.

**Location:** `/apps/electron/src/renderer/overlay/src/` (expand existing components)

**Technical Requirements:**
- Render on transparent, click-through window
- Support multiple highlight types: arrow, box, circle, tooltip
- Animate highlights (fade in, pulse)
- Position overlays based on absolute screen coordinates
- Support multi-monitor coordinate translation
- Render using Canvas API for performance
- Layer system: background highlights → arrows → tooltips
- Auto-adjust for window movement
- Smooth transitions (300ms duration)

**Component Structure:**
```
OverlayRenderer/
├── OverlayCanvas.tsx (main canvas component)
├── types.ts (Highlight, Arrow, Tooltip interfaces)
├── renderers/
│   ├── ArrowRenderer.ts
│   ├── BoxRenderer.ts
│   ├── TooltipRenderer.ts
│   └── CircleRenderer.ts
├── animations/
│   ├── FadeIn.ts
│   ├── Pulse.ts
│   └── DrawPath.ts
└── utils/
    ├── coordinates.ts
    └── colors.ts
```

**Highlight Types:**
1. **Box Highlight:** Red/yellow border around element (3px width)
2. **Arrow:** Curved arrow from point to element with label
3. **Tooltip:** Floating text box with white background, drop shadow
4. **Circle:** Pulsing circle around element
5. **Dimming:** Darken everything except highlighted element

**Implementation Steps:**
1. Create Canvas-based rendering system
2. Implement coordinate transformation (screen → window)
3. Build Arrow renderer with Bezier curves
4. Build Box renderer with rounded corners
5. Build Tooltip renderer with auto-positioning (avoid screen edges)
6. Build Circle renderer with radial gradient pulse
7. Implement animation system with RAF loop
8. Add IPC handler `OVERLAY_SHOW_HIGHLIGHTS`
9. Add IPC handler `OVERLAY_CLEAR_HIGHLIGHTS`
10. Implement z-index layering
11. Add fade-in/fade-out transitions
12. Handle window resize and movement events
13. Optimize rendering for 60fps

**Acceptance Criteria:**
- [ ] Overlays render within 200ms of receiving highlight data
- [ ] Animations run at smooth 60fps
- [ ] Arrows point accurately to elements (±5px tolerance)
- [ ] Tooltips never clip off screen edges
- [ ] Overlays remain click-through (underlying apps still functional)
- [ ] Multi-monitor setups handled correctly
- [ ] Overlays update when windows move
- [ ] Memory usage under 50MB with 10 active highlights
- [ ] Supports up to 20 simultaneous highlights
- [ ] Clear command removes all highlights within 100ms
- [ ] Dark and light backgrounds both supported
- [ ] Arrows curve naturally (no straight lines)
- [ ] Tooltips have proper drop shadows and readability

**Testing Requirements:**
- Test with 1, 5, 10, 20 highlights simultaneously
- Test on monitors at different DPI settings
- Test with windows in all screen positions (corners, edges, center)
- Test animation performance under CPU load
- Test with dark and light application backgrounds
- Test multi-monitor scenarios (highlights on secondary screen)
- Test window dragging while highlights active
- Test rapid show/clear cycles (100 iterations)
- Visual regression testing with screenshot comparison
- Accessibility: Test with screen readers (overlays should be ignored)

**Dependencies:**
- Task 1.2 (UI Detection) must be complete
- Overlay window already exists (implemented)

**Estimated Effort:** 6-7 days

---

### Task 1.4: End-to-End Help Flow Integration

**Description:** Connect all pieces (capture → detect → overlay) into a seamless user experience triggered by Cmd+H.

**Location:** Multiple files across electron app and backend

**Flow Diagram:**
```
User presses Cmd+H
    ↓
Agent Window receives event
    ↓
Main process captures screenshot
    ↓
Screenshot sent to backend /api/vision/detect
    ↓
Backend analyzes with Gemini Vision
    ↓
UI elements returned to main process
    ↓
Main process sends to LLM service with user query
    ↓
LLM determines which elements to highlight
    ↓
Overlay window receives highlight instructions
    ↓
Highlights render on screen
    ↓
User sees visual guidance
```

**Technical Requirements:**
- Complete flow executes in under 5 seconds
- User receives feedback at each stage (loading states)
- Errors at any stage show helpful messages
- User can cancel operation mid-flow
- Agent window stays open during processing
- Conversation history includes screenshot context
- Analytics track each step's success/failure
- Graceful degradation if vision API fails (text-only help)

**Implementation Steps:**
1. Create orchestration service `/apps/backend/src/services/helpFlowService.ts`
2. Add IPC channel `HELP_REQUEST_WITH_SCREENSHOT`
3. Implement state machine for flow stages:
   - `IDLE` → `CAPTURING` → `ANALYZING` → `GENERATING` → `HIGHLIGHTING` → `COMPLETE`
4. Update Agent window UI with progress indicator
5. Add timeout handling (10s max per stage)
6. Implement error recovery strategies
7. Add cancel functionality
8. Store screenshot context in conversation
9. Update LLM prompt to include detected UI elements
10. Add analytics events for each stage
11. Implement retry logic for transient failures
12. Add comprehensive logging

**Agent Window UI Updates:**
- Show spinner with stage text: "Capturing screen...", "Analyzing interface...", "Generating guidance..."
- Show progress bar (0-100%)
- Add cancel button
- Show error states with retry option
- Animate transitions between states

**Acceptance Criteria:**
- [ ] Cmd+H initiates complete flow without additional user action
- [ ] Total flow completes in under 5 seconds (90th percentile)
- [ ] User sees progress feedback within 100ms of Cmd+H
- [ ] Screenshot, detection, and highlight all succeed end-to-end
- [ ] AI response references detected UI elements by name
- [ ] Highlights appear correctly on described elements
- [ ] User can cancel at any stage
- [ ] Errors show actionable messages (not generic)
- [ ] Flow works on both macOS and Windows
- [ ] Works with both full screen and windowed apps
- [ ] Conversation history shows screenshot thumbnail
- [ ] Analytics capture success rate >95% in testing
- [ ] Failed flows log detailed error context
- [ ] Network failures handled gracefully
- [ ] Works offline for cached screenshots

**Testing Requirements:**
- Test complete flow 50+ times with various applications
- Test with slow network conditions (simulated)
- Test with API failures at each stage
- Test cancellation at each stage
- Test concurrent help requests (multiple users)
- Test with screenshot cache hits and misses
- Test error recovery and retry mechanisms
- User acceptance testing with 5+ beta testers
- Performance profiling of entire flow
- Monitor error rates in staging environment

**Dependencies:**
- Task 1.1 (Screenshot Capture) must be complete
- Task 1.2 (UI Detection) must be complete
- Task 1.3 (Overlay Rendering) must be complete
- Existing conversation system operational ✓

**Estimated Effort:** 4-5 days

---

## Phase 2: Knowledge Base & Semantic Search
**Priority:** HIGH  
**Timeline:** Weeks 3-4  
**Current Status:** 50% Complete  
**Impact:** Essential for contextual AI responses

### Task 2.1: Complete Document Ingestion Pipeline

**Description:** Build full pipeline to process uploaded documents (PDF, Notion, Slack), chunk them intelligently, generate embeddings, and store in Pinecone vector database.

**Location:** `/apps/backend/src/services/ingestionService.ts` (new file)

**Technical Requirements:**
- Support document types: PDF, Notion pages, Slack messages, plain text, markdown
- Intelligent chunking strategy:
  - Respect semantic boundaries (paragraphs, sections)
  - Chunk size: 500-1000 tokens with 100 token overlap
  - Preserve code blocks, lists, tables
- Generate embeddings with OpenAI `text-embedding-3-large` (1536 dimensions)
- Batch processing for efficiency (up to 100 chunks per request)
- Store in Pinecone with rich metadata
- Handle rate limits and retries
- Track ingestion progress and errors
- Support incremental updates (re-index changed docs)

**Metadata Schema:**
```typescript
{
  doc_id: string,           // UUID of source document
  title: string,            // Document title
  type: 'pdf' | 'notion' | 'slack' | 'text',
  chunk_index: number,      // Position in document
  chunk_text: string,       // The actual text chunk
  org_id: string,          // Organization identifier
  source_url?: string,     // Original URL if applicable
  created_at: ISO8601,     // When ingested
  updated_at: ISO8601,     // Last updated
  author?: string,         // Document creator
  tags?: string[],         // User-defined tags
  section_heading?: string // Heading of section this chunk belongs to
}
```

**Implementation Steps:**
1. Create `IngestionService` class with methods:
   - `ingestDocument(docId, content, metadata)`
   - `ingestNotion(pageId)`
   - `ingestSlackChannel(channelId, since)`
   - `deleteDocument(docId)`
   - `updateDocument(docId, content, metadata)`
2. Implement chunking algorithm:
   - Use recursive character splitter
   - Detect and preserve semantic boundaries
   - Add sliding window overlap
3. Create batch embedding generator:
   - Group chunks into batches of 100
   - Call OpenAI embeddings API
   - Handle rate limits with exponential backoff
4. Implement Pinecone upsert logic:
   - Batch upsert (100 vectors at a time)
   - Include all metadata
   - Use doc_id as namespace for easy deletion
5. Add progress tracking with Redis or in-memory cache
6. Create `/api/admin/ingest` endpoints:
   - POST `/api/admin/ingest/document` (multipart file upload)
   - POST `/api/admin/ingest/notion/:pageId`
   - POST `/api/admin/ingest/slack/:channelId`
   - DELETE `/api/admin/ingest/:docId`
   - GET `/api/admin/ingest/status/:jobId`
7. Add job queue for async processing (BullMQ or similar)
8. Implement webhook for Notion/Slack changes (optional)
9. Add unit tests and integration tests

**Acceptance Criteria:**
- [ ] Can ingest PDF files up to 100MB in size
- [ ] Can ingest Notion pages with all blocks (text, lists, code, tables)
- [ ] Can ingest Slack channel history (up to 10k messages)
- [ ] Chunking preserves semantic boundaries (no cut-off sentences)
- [ ] Embeddings generated for all chunks without errors
- [ ] All chunks successfully stored in Pinecone
- [ ] Metadata correctly attached to all vectors
- [ ] Ingestion of 100-page document completes in <5 minutes
- [ ] Failed ingestions logged with detailed error info
- [ ] Can re-ingest updated documents (old chunks replaced)
- [ ] Can delete all chunks for a document
- [ ] Progress tracking shows real-time status
- [ ] Handles OpenAI and Pinecone rate limits gracefully
- [ ] No memory leaks with large documents (100MB+)
- [ ] Batch processing reduces API calls by >80%

**Testing Requirements:**
- Test with various PDF sizes (1KB to 100MB)
- Test with complex Notion pages (nested blocks, databases)
- Test with long Slack channel histories (1000+ messages)
- Test with malformed/corrupted files
- Test chunking algorithm with edge cases (very short/long docs)
- Test embedding generation under rate limits
- Test Pinecone upsert failures and retries
- Load test with 100 concurrent ingestion jobs
- Test memory usage during ingestion of large files
- Integration test full pipeline end-to-end

**Dependencies:**
- Pinecone client configured ✓
- OpenAI API key in environment ✓
- Notion and Slack OAuth tokens available ✓
- Database schema for `source_materials` exists ✓

**Estimated Effort:** 6-7 days

---

### Task 2.2: Implement Hybrid Search

**Description:** Build search functionality that combines semantic search (Pinecone vector similarity) with keyword search (PostgreSQL full-text search) for optimal retrieval.

**Location:** `/apps/backend/src/services/searchService.ts` (new file)

**Technical Requirements:**
- Hybrid approach: 70% semantic + 30% keyword (tunable)
- Use Reciprocal Rank Fusion (RRF) to merge results
- Support filters: document type, date range, author, tags
- Return top K results with relevance scores
- Include snippet context (±100 chars around match)
- Deduplicate results by chunk_id
- Support multi-query expansion (synonyms, rephrasing)
- Cache frequent queries (TTL: 10 minutes)
- Log search queries for analytics

**Search Algorithm:**
```
1. Generate embedding for user query (OpenAI)
2. Semantic search: Query Pinecone (top 20 results)
3. Keyword search: Query PostgreSQL full-text search (top 20 results)
4. Merge results using RRF with weights
5. Filter by metadata criteria
6. Deduplicate by chunk_id
7. Return top K (default: 5) with scores and snippets
```

**Implementation Steps:**
1. Create `SearchService` class with method:
   - `search(query, filters?, topK?): SearchResult[]`
2. Implement semantic search:
   - Generate query embedding
   - Query Pinecone with filters
   - Return results with scores
3. Implement keyword search:
   - Add `search_vector` column to `source_materials` (PostgreSQL tsvector)
   - Create GIN index on `search_vector`
   - Use `ts_rank` for relevance scoring
4. Implement RRF merging:
   - Rank results from both sources
   - Apply RRF formula: `score = Σ 1/(k + rank)` for k=60
   - Combine scores with 70/30 weighting
5. Implement snippet extraction:
   - Find query terms in chunk text
   - Extract context window
   - Highlight matches with markdown
6. Add caching layer (Redis or in-memory LRU)
7. Create `/api/search` endpoint:
   - GET `/api/search?q=query&type=notion&limit=10`
8. Add search analytics to `analytics_events` table
9. Implement query expansion (optional):
   - Use LLM to generate synonyms/related terms
   - Perform multiple searches and merge
10. Add unit and integration tests

**Acceptance Criteria:**
- [ ] Semantic search returns relevant results for conceptual queries
- [ ] Keyword search returns exact matches for specific terms
- [ ] Hybrid results better than either method alone (measured by nDCG)
- [ ] Search responds in under 500ms for cached queries
- [ ] Search responds in under 2 seconds for uncached queries
- [ ] Filters correctly narrow results (type, date, author)
- [ ] Snippets highlight relevant context
- [ ] Deduplication removes identical chunks
- [ ] Cache improves repeat query performance by >80%
- [ ] Handles typos gracefully (fuzzy matching)
- [ ] Empty results return helpful suggestions
- [ ] Search logs include query, results count, latency
- [ ] Works with queries in natural language and keywords
- [ ] Returns results even with partial metadata matches
- [ ] RRF merging produces diverse result set

**Testing Requirements:**
- Create test dataset of 1000+ documents with ground truth
- Measure precision@5 and recall@10
- Compare hybrid vs semantic-only vs keyword-only
- Test with various query types (questions, keywords, phrases)
- Test filter combinations
- Test with empty knowledge base (graceful handling)
- Load test with 100 concurrent searches
- Test cache hit/miss scenarios
- Benchmark search latency across different query complexities
- User testing: 5+ people rate result relevance

**Dependencies:**
- Task 2.1 (Document Ingestion) must be complete
- Pinecone index populated with embeddings
- PostgreSQL full-text search extensions enabled

**Estimated Effort:** 5-6 days

---

### Task 2.3: Integrate Search with AI Responses

**Description:** Connect the search system to the conversation flow so AI responses are grounded in the organization's knowledge base.

**Location:** `/apps/backend/src/services/llm.service.ts` (expand existing)

**Technical Requirements:**
- Automatically search knowledge base for relevant context
- Include search results in LLM prompt as "retrieved documents"
- Implement RAG (Retrieval-Augmented Generation) pattern
- Track which sources were used in response
- Show sources to user with citations
- Fallback to general knowledge if no relevant docs found
- Limit context to 4000 tokens (to stay within limits)
- Rank retrieved docs by relevance before including
- Support follow-up questions with conversation context

**RAG Prompt Template:**
```
You are Mitable, an AI assistant helping new employees onboard.

RETRIEVED CONTEXT (from company knowledge base):
---
[Document 1 - Notion Page: "Engineering Onboarding"]
Chunk 1: Our team uses GitHub for version control. All code must be reviewed...
Chunk 2: Development environment setup requires Docker...

[Document 2 - Slack #engineering: Message from Alice]
"Don't forget to install the latest Node.js LTS version before running npm install..."
---

CONVERSATION HISTORY:
User: How do I set up my development environment?
Assistant: To set up your development environment...

USER QUERY: {user's current question}

Instructions:
- Answer based on the retrieved context when relevant
- Cite sources using [Document X] notation
- If context doesn't cover the question, say so clearly
- Be specific and actionable
```

**Implementation Steps:**
1. Update `llm.service.ts` to add RAG capability:
   - Add `searchService` dependency
   - Implement `ragCompletion(query, conversationHistory)` method
2. Modify conversation flow:
   - Before LLM call, search knowledge base
   - Extract top 5 most relevant chunks
   - Format chunks as context in prompt
   - Include document titles and metadata
3. Track source usage:
   - Parse LLM response for source citations
   - Store cited doc_ids in `messages.cardData.sources`
4. Update UI to show sources:
   - Add "Sources" section below AI response
   - Show document title and snippet
   - Link to full document
5. Implement context window management:
   - Prioritize recent conversation over retrieved docs
   - Truncate retrieved context if exceeds token limit
   - Keep most relevant chunks
6. Add fallback logic:
   - If no relevant docs found (score <0.7), skip RAG
   - Let LLM use general knowledge
   - Inform user "No specific company docs found"
7. Optimize for follow-up questions:
   - Maintain search context across turns
   - Re-search only if topic changes significantly
8. Add analytics:
   - Track RAG usage rate
   - Track source citation rate
   - Track user feedback on responses
9. Update frontend to render sources

**Acceptance Criteria:**
- [ ] AI responses cite relevant company documents when available
- [ ] Citations include document name and type
- [ ] Users can click sources to view full document
- [ ] RAG improves answer quality (measured by user feedback)
- [ ] Responses indicate when using general vs company knowledge
- [ ] Follow-up questions maintain context
- [ ] No hallucinated sources (all citations are real)
- [ ] Token limit never exceeded (4000 max context)
- [ ] Graceful handling when no relevant docs exist
- [ ] Sources section shows max 5 documents
- [ ] Response time <5 seconds including search
- [ ] Analytics track RAG usage and effectiveness
- [ ] Users can rate answer helpfulness
- [ ] System logs which documents were retrieved but not cited

**Testing Requirements:**
- Test with queries that have relevant docs vs those that don't
- Test with single-source vs multi-source answers
- Test citation accuracy (all cited sources are real)
- Test token limit edge cases (very long context)
- Test follow-up question context retention
- User study: Compare RAG vs non-RAG responses (20+ queries)
- Measure citation accuracy (precision/recall)
- Test with empty knowledge base
- Test with queries outside company domain
- Load test RAG flow with 50 concurrent conversations

**Dependencies:**
- Task 2.2 (Hybrid Search) must be complete
- Knowledge base populated with content
- Existing conversation system operational ✓
- Frontend supports rendering sources in messages

**Estimated Effort:** 4-5 days

---

## Phase 3: Security & Token Management
**Priority:** HIGH  
**Timeline:** Week 5  
**Current Status:** 40% Complete  
**Impact:** Critical for production deployment

### Task 3.1: Implement Token Encryption

**Description:** Encrypt all OAuth tokens (Slack, Notion) and API keys before storing in database using AES-256-GCM encryption.

**Location:** `/apps/backend/src/services/encryption.service.ts` (new file)

**Technical Requirements:**
- Use AES-256-GCM encryption algorithm
- Store encryption key in environment variable (not in code)
- Use unique IV (initialization vector) per token
- Store IV alongside encrypted token in database
- Implement key rotation support
- Encrypt at rest (database) and in transit (HTTPS)
- Decrypt only when needed for API calls
- Never log decrypted tokens
- Support encryption of: OAuth access tokens, refresh tokens, API keys

**Database Schema Update:**
```sql
ALTER TABLE integrations ADD COLUMN encrypted_access_token BYTEA;
ALTER TABLE integrations ADD COLUMN access_token_iv BYTEA;
ALTER TABLE integrations ADD COLUMN encrypted_refresh_token BYTEA;
ALTER TABLE integrations ADD COLUMN refresh_token_iv BYTEA;
ALTER TABLE integrations ADD COLUMN encryption_key_version INTEGER DEFAULT 1;
-- Remove plaintext columns in migration
```

**Implementation Steps:**
1. Create `EncryptionService` class:
   - `encrypt(plaintext: string): {ciphertext: Buffer, iv: Buffer}`
   - `decrypt(ciphertext: Buffer, iv: Buffer): string`
   - `rotateKeys(oldVersion: number, newVersion: number)` (future)
2. Generate and store master encryption key:
   - Use `crypto.randomBytes(32)` for 256-bit key
   - Store in environment variable `ENCRYPTION_MASTER_KEY`
   - Add to `.env.example` with instructions
   - Document key generation in deployment guide
3. Update `IntegrationService`:
   - Encrypt tokens before database writes
   - Decrypt tokens when making API calls
   - Update all integration flows (Slack, Notion)
4. Create database migration:
   - Add new encrypted columns
   - Migrate existing tokens (if any) with new encryption
   - Remove old plaintext columns
   - Add encryption_key_version column
5. Update OAuth flows:
   - Encrypt tokens immediately after OAuth callback
   - Store encrypted token + IV in database
6. Add key rotation support:
   - Method to re-encrypt all tokens with new key
   - Support multiple key versions simultaneously
   - Admin endpoint to trigger rotation
7. Add comprehensive logging (without sensitive data):
   - Log encryption/decryption attempts
   - Log key rotation events
   - Never log plaintext tokens or keys
8. Add error handling:
   - Handle decryption failures gracefully
   - Prompt user to re-authenticate if token unrecoverable
9. Write security tests

**Acceptance Criteria:**
- [ ] All OAuth tokens encrypted before database storage
- [ ] Tokens successfully decrypted when needed for API calls
- [ ] No plaintext tokens in database
- [ ] No plaintext tokens in logs
- [ ] Encryption key never exposed in code or responses
- [ ] IV uniquely generated for each encryption operation
- [ ] Decryption failures trigger re-authentication flow
- [ ] Key rotation supported (documented, tested)
- [ ] Performance impact <50ms per encrypt/decrypt operation
- [ ] Integration tests verify end-to-end encryption
- [ ] Security audit passes (use third-party tool)
- [ ] Deployment documentation includes key management
- [ ] Backup/restore procedures handle encrypted data
- [ ] Works with existing Slack and Notion integrations
- [ ] Admin can view encryption status (not decrypt) in UI

**Testing Requirements:**
- Unit tests for encryption/decryption
- Test with various token lengths and formats
- Test key rotation with simulated tokens
- Test decryption failure scenarios
- Test concurrent encrypt/decrypt operations
- Security audit with OWASP ZAP or similar
- Penetration testing (if budget allows)
- Code review focused on security
- Test backup/restore with encrypted data
- Performance benchmark encrypt/decrypt operations

**Dependencies:**
- Existing integration system operational ✓
- Node.js `crypto` module available ✓

**Estimated Effort:** 4-5 days

---

### Task 3.2: Implement Automatic Token Refresh

**Description:** Add logic to automatically refresh OAuth tokens before they expire to maintain seamless integration connectivity.

**Location:** `/apps/backend/src/services/tokenRefreshService.ts` (new file)

**Technical Requirements:**
- Check token expiration before each API call
- Refresh token if expires in <1 hour
- Store new access token and expiry time
- Handle refresh token rotation (some providers issue new refresh token)
- Implement background job to refresh soon-to-expire tokens
- Retry failed refreshes with exponential backoff
- Notify admin if refresh fails after 3 attempts
- Log all refresh attempts for audit trail
- Support both Slack and Notion OAuth flows

**OAuth Token Refresh Flow:**
```
API call initiated
    ↓
Check token expiry time
    ↓
If expires in <1 hour
    ↓
Call provider's token refresh endpoint
    ↓
Receive new access token + expiry
    ↓
Encrypt and store new token
    ↓
Update expiry time in database
    ↓
Proceed with original API call
```

**Implementation Steps:**
1. Create `TokenRefreshService` class:
   - `refreshIfNeeded(integrationId: string): Promise<void>`
   - `refreshSlackToken(integration: Integration): Promise<TokenResponse>`
   - `refreshNotionToken(integration: Integration): Promise<TokenResponse>`
2. Add expiry tracking to `integrations` table:
   - Add `access_token_expires_at` column (timestamp)
   - Add `last_refresh_at` column (timestamp)
   - Add `refresh_attempt_count` column (integer)
3. Update `IntegrationService`:
   - Check token expiry before API calls
   - Call `refreshIfNeeded()` automatically
   - Handle refresh failures gracefully
4. Implement Slack token refresh:
   - POST to `https://slack.com/api/oauth.v2.access`
   - Use refresh_token from database
   - Store new tokens and expiry
5. Implement Notion token refresh:
   - POST to `https://api.notion.com/v1/oauth/token`
   - Use refresh_token from database
   - Store new tokens and expiry
6. Create background job (cron or scheduled task):
   - Run every hour
   - Find tokens expiring in <24 hours
   - Proactively refresh them
   - Log results
7. Add retry logic with exponential backoff:
   - Retry failed refreshes 3 times
   - Wait 1s, 5s, 15s between attempts
   - After 3 failures, mark integration as `needs_reconnect`
8. Add admin notification:
   - Send email/Slack message if refresh fails
   - Show warning in admin UI
   - Provide "Reconnect" button
9. Update frontend:
   - Show token status in integrations page
   - Show last refresh time
   - Show warning if needs reconnect
10. Add comprehensive logging and monitoring

**Acceptance Criteria:**
- [ ] Tokens automatically refresh before expiration
- [ ] API calls never fail due to expired tokens
- [ ] Refresh occurs seamlessly without user awareness
- [ ] Background job refreshes soon-to-expire tokens
- [ ] Failed refreshes trigger admin notification
- [ ] Failed refreshes marked in UI with reconnect option
- [ ] Refresh logic handles both Slack and Notion
- [ ] Handles refresh token rotation correctly
- [ ] Retry logic prevents transient failures from breaking integrations
- [ ] New tokens encrypted before storage
- [ ] Expiry times accurately tracked
- [ ] Admin dashboard shows token health status
- [ ] Logs include all refresh attempts and outcomes
- [ ] Performance impact <100ms per refresh check
- [ ] Works with rate-limited refresh endpoints

**Testing Requirements:**
- Test refresh logic with mock OAuth providers
- Test with tokens at various expiry states (expired, expiring soon, fresh)
- Test refresh token rotation scenarios
- Test background job with scheduled tasks
- Test retry logic with simulated failures
- Test admin notification delivery
- Test UI reconnect flow end-to-end
- Integration tests with real Slack/Notion refresh endpoints (staging)
- Test concurrent refresh attempts (race conditions)
- Load test background job with 100+ integrations

**Dependencies:**
- Task 3.1 (Token Encryption) must be complete
- Existing integration OAuth flows operational ✓
- Background job scheduler available (node-cron or similar)

**Estimated Effort:** 5-6 days

---

### Task 3.3: Add Comprehensive Error Handling

**Description:** Implement robust error handling across all backend services with user-friendly error messages, detailed logging, and graceful degradation.

**Location:** All backend services + `/apps/backend/src/middleware/errorHandler.ts`

**Technical Requirements:**
- Catch all errors at appropriate boundaries
- Map technical errors to user-friendly messages
- Log errors with context (user, action, timestamp, stack trace)
- Implement error hierarchy (fatal, error, warning, info)
- Return structured error responses (consistent JSON format)
- Never expose sensitive data in error messages
- Implement circuit breakers for external services
- Add timeout handling for long-running operations
- Support error reporting to external service (e.g., Sentry)
- Graceful degradation when services unavailable

**Error Response Format:**
```typescript
{
  error: {
    code: "INTEGRATION_OAUTH_FAILED",
    message: "Failed to connect to Slack. Please try again.",
    details?: "Token refresh failed after 3 attempts", // Optional, for admins
    retryable: true,
    action?: "reconnect_integration" // Suggested action
  }
}
```

**Error Categories:**
- **Auth Errors:** Invalid credentials, expired sessions, insufficient permissions
- **Integration Errors:** OAuth failures, API rate limits, connection timeouts
- **Validation Errors:** Invalid input, missing required fields, format errors
- **Database Errors:** Connection failures, constraint violations, deadlocks
- **AI Service Errors:** OpenAI/Gemini API failures, rate limits, timeouts
- **Vector Store Errors:** Pinecone connection issues, query failures
- **Business Logic Errors:** Invalid state transitions, rule violations

**Implementation Steps:**
1. Create `ErrorHandler` middleware:
   - Catch unhandled errors
   - Log with appropriate level
   - Format error response
   - Set correct HTTP status code
2. Define error classes for each category:
   ```typescript
   class AuthenticationError extends Error
   class IntegrationError extends Error
   class ValidationError extends Error
   class DatabaseError extends Error
   class ExternalServiceError extends Error
   ```
3. Update all services to throw typed errors:
   - Replace generic errors with specific classes
   - Include context in error construction
4. Implement circuit breakers:
   - Use `opossum` library
   - Wrap external API calls
   - Open circuit after 5 consecutive failures
   - Half-open retry after 30 seconds
5. Add timeout middleware:
   - Default: 30 seconds
   - Override for specific routes (e.g., ingestion: 5 minutes)
6. Integrate error tracking service:
   - Install Sentry SDK (or similar)
   - Configure DSN in environment
   - Add context to error reports
   - Filter sensitive data before sending
7. Create error logging utility:
   - Structured logging with Winston or Pino
   - Include: timestamp, user_id, org_id, error_code, stack_trace
   - Different log levels for different error types
   - Rotate log files daily
8. Update all route handlers:
   - Wrap in try-catch
   - Use typed errors
   - Return consistent error responses
9. Add user-friendly error messages:
   - Map technical errors to simple explanations
   - Include suggested actions
   - Provide support contact for fatal errors
10. Create admin error dashboard:
    - View recent errors
    - Filter by type, service, user
    - Show error trends over time
11. Document common errors and resolutions

**Acceptance Criteria:**
- [ ] All errors caught and handled appropriately
- [ ] Error responses use consistent JSON format
- [ ] No stack traces exposed to end users (only to admins/logs)
- [ ] All errors logged with sufficient context for debugging
- [ ] Circuit breakers prevent cascade failures
- [ ] Timeouts prevent hung requests
- [ ] Sentry receives error reports for fatal errors
- [ ] User-facing errors are clear and actionable
- [ ] Sensitive data never appears in logs or error messages
- [ ] Admin dashboard shows error trends and details
- [ ] Different error types trigger different handling
- [ ] Retryable errors indicate retry possibility
- [ ] Non-retryable errors indicate permanence
- [ ] 500 errors trigger alerts (email/Slack)
- [ ] Error documentation covers top 20 errors

**Testing Requirements:**
- Simulate each error category (auth, integration, validation, etc.)
- Test circuit breaker behavior (open, half-open, closed states)
- Test timeout handling with delayed responses
- Test error logging for each severity level
- Test Sentry integration with real errors
- Test error response format consistency
- Test sensitive data filtering in logs
- Load test error handling under high load
- Test error dashboard UI with various error types
- Code review for error handling coverage

**Dependencies:**
- None (can implement alongside other tasks)
- Sentry account and DSN (optional but recommended)

**Estimated Effort:** 6-7 days

---

## Phase 4: Real-time Integrations & Background Workers
**Priority:** MEDIUM  
**Timeline:** Week 6  
**Current Status:** 60% Complete  
**Impact:** Improves user experience and data freshness

### Task 4.1: Build Background Worker Infrastructure

**Description:** Create job queue and worker system to handle asynchronous tasks like document ingestion, integration syncing, and scheduled operations.

**Location:** `/apps/backend/src/workers/` (new directory)

**Technical Requirements:**
- Use BullMQ for job queue (Redis-backed)
- Support job types: ingestion, sync, scheduled tasks, notifications
- Implement job priorities (high, normal, low)
- Retry failed jobs with exponential backoff
- Track job progress and status
- Support scheduled/recurring jobs (cron)
- Implement concurrency limits per job type
- Add job telemetry (duration, success rate, failure reasons)
- Support job cancellation
- Graceful shutdown handling

**Worker Architecture:**
```
Job Queue (Redis)
    ↓
Worker Processes
├── Ingestion Worker (concurrency: 2)
├── Sync Worker (concurrency: 5)
├── Scheduled Tasks Worker (concurrency: 1)
└── Notification Worker (concurrency: 10)
```

**Job Types:**
1. **Ingestion Jobs:** Process uploaded documents
2. **Sync Jobs:** Fetch data from Slack/Notion
3. **Scheduled Tasks:** Token refresh, cleanup, analytics
4. **Notification Jobs:** Send nudges via Slack, emails

**Implementation Steps:**
1. Install and configure BullMQ:
   - `npm install bullmq ioredis`
   - Configure Redis connection
   - Set up separate queues for job types
2. Create queue definitions:
   - `/workers/queues/ingestionQueue.ts`
   - `/workers/queues/syncQueue.ts`
   - `/workers/queues/scheduledQueue.ts`
   - `/workers/queues/notificationQueue.ts`
3. Implement worker processes:
   - `/workers/ingestionWorker.ts`
   - `/workers/syncWorker.ts`
   - `/workers/scheduledWorker.ts`
   - `/workers/notificationWorker.ts`
4. Define job handlers:
   ```typescript
   ingestionQueue.process(async (job) => {
     const { docId, content, metadata } = job.data;
     await ingestionService.ingestDocument(docId, content, metadata);
     return { status: 'success', chunksCreated: 150 };
   });
   ```
5. Add job creation utilities:
   - `queueIngestion(docId, content, metadata, priority?)`
   - `queueSync(integrationType, orgId, priority?)`
   - `scheduleRecurringTask(taskName, cronExpression, data)`
6. Implement progress tracking:
   - Update job progress percentage
   - Store intermediate results
   - UI displays progress in real-time
7. Add retry configuration:
   - Ingestion: 3 retries, exponential backoff (1s, 10s, 60s)
   - Sync: 5 retries, exponential backoff
   - Notifications: 3 retries, fixed delay (5s)
8. Implement concurrency limits:
   - Ingestion: Max 2 concurrent (resource-intensive)
   - Sync: Max 5 concurrent
   - Notifications: Max 10 concurrent
9. Create admin UI for job monitoring:
   - View active, completed, failed jobs
   - View job logs and errors
   - Retry or cancel jobs manually
   - View queue health metrics
10. Add telemetry and monitoring:
    - Track job duration, success rate
    - Alert on high failure rates
    - Dashboard with queue metrics
11. Implement graceful shutdown:
    - Finish in-progress jobs before exit
    - Requeue incomplete jobs
    - Handle SIGTERM and SIGINT signals
12. Add worker health checks:
    - Endpoint for orchestration tools (e.g., PM2, Docker)

**Acceptance Criteria:**
- [ ] Jobs successfully queued and processed asynchronously
- [ ] Failed jobs automatically retry with backoff
- [ ] Job progress tracked and visible in UI
- [ ] Recurring jobs execute on schedule
- [ ] Workers respect concurrency limits
- [ ] Admin can view and manage jobs in UI
- [ ] Telemetry tracks job performance
- [ ] High failure rates trigger alerts
- [ ] Workers gracefully shut down on signal
- [ ] Job queue survives Redis restarts
- [ ] Multiple worker processes can run simultaneously
- [ ] Job priorities respected (high jobs processed first)
- [ ] Long-running jobs don't block others
- [ ] Failed jobs logged with detailed errors
- [ ] Worker processes auto-restart on crash (with PM2 or similar)

**Testing Requirements:**
- Test job queuing and processing end-to-end
- Test retry logic with simulated failures
- Test concurrency limits (queue 20 jobs, verify only N run concurrently)
- Test scheduled job execution (cron)
- Test graceful shutdown (SIGTERM during job processing)
- Test worker crash recovery
- Test Redis connection loss and recovery
- Load test with 1000+ jobs queued
- Test admin UI job management
- Test telemetry and alerting

**Dependencies:**
- Redis instance available (local or hosted)
- Task 2.1 (Ingestion Pipeline) complete for ingestion jobs
- Task 4.2 (Sync Logic) complete for sync jobs

**Estimated Effort:** 5-6 days

---

### Task 4.2: Implement Auto-Sync for Slack and Notion

**Description:** Build automatic synchronization of Slack messages and Notion pages to keep knowledge base up-to-date without manual intervention.

**Location:** `/apps/backend/src/workers/syncWorker.ts` and service updates

**Technical Requirements:**
- Auto-sync on schedule (every 6 hours for Slack, daily for Notion)
- Support incremental sync (only fetch new/updated content since last sync)
- Use webhooks for real-time updates (optional enhancement)
- Detect and handle deleted content (remove from vector store)
- Respect rate limits (Slack: 1 req/sec, Notion: 3 req/sec)
- Track sync status per integration (last_sync_at, next_sync_at, status)
- Handle large datasets efficiently (paginated fetching)
- Support manual trigger from admin UI
- Log all sync operations for audit trail

**Sync Flow:**
```
Scheduled trigger (cron) or manual trigger
    ↓
Query integrations table for active integrations
    ↓
For each integration:
    ├── Check last_sync_at timestamp
    ├── Fetch new/updated content since last_sync_at
    ├── Queue ingestion jobs for each document
    ├── Update last_sync_at timestamp
    ├── Log sync results (items added/updated/deleted)
    └── Handle errors (retry or mark failed)
```

**Implementation Steps:**
1. Update `integrations` table:
   - Add `last_sync_at` column (timestamp)
   - Add `next_sync_at` column (timestamp)
   - Add `sync_status` column (idle, syncing, failed)
   - Add `sync_error_message` column (text)
2. Implement Slack sync logic:
   - Fetch channels for workspace
   - For each channel, fetch messages since `last_sync_at`
   - Use `conversations.history` API with `oldest` parameter
   - Paginate through results (100 messages per page)
   - Queue ingestion job for each message batch
   - Handle rate limits with exponential backoff
3. Implement Notion sync logic:
   - Fetch pages in workspace (use search API)
   - Filter by `last_edited_time` > `last_sync_at`
   - For each page, fetch full content
   - Queue ingestion job for each page
   - Handle rate limits with delays
4. Implement delete detection:
   - Track synced doc_ids in database
   - Compare current content with last sync
   - Delete removed items from Pinecone
   - Mark as deleted in `source_materials` table
5. Create sync scheduler:
   - Use node-cron or BullMQ repeatable jobs
   - Schedule Slack sync every 6 hours
   - Schedule Notion sync every 24 hours
   - Store schedule in database (configurable per integration)
6. Update sync worker to handle sync jobs:
   ```typescript
   syncQueue.process(async (job) => {
     const { integrationId, type } = job.data;
     if (type === 'slack') await syncSlack(integrationId);
     if (type === 'notion') await syncNotion(integrationId);
   });
   ```
7. Add manual sync trigger:
   - Admin endpoint: POST `/api/admin/integrations/:id/sync`
   - Queue sync job immediately
   - Return job ID for status tracking
8. Implement sync status tracking:
   - Update `sync_status` to 'syncing' when started
   - Update `last_sync_at` and `sync_status` to 'idle' when completed
   - Set `sync_status` to 'failed' and log error on failure
9. Add rate limit handling:
   - Use `bottleneck` library for rate limiting
   - Slack: 1 request per second
   - Notion: 3 requests per second
   - Exponential backoff on 429 errors
10. Update admin UI:
    - Show sync status for each integration
    - Show last sync time and next scheduled sync
    - "Sync Now" button for manual trigger
    - View sync logs and errors
11. Add sync analytics:
    - Track items synced per run
    - Track sync duration
    - Track success/failure rate
12. Implement error notifications:
    - Alert admin if sync fails 3 times consecutively
    - Show sync errors in admin UI

**Acceptance Criteria:**
- [ ] Slack messages automatically sync every 6 hours
- [ ] Notion pages automatically sync daily
- [ ] Incremental sync only fetches new/changed content
- [ ] Deleted content removed from knowledge base
- [ ] Rate limits respected (no 429 errors)
- [ ] Large workspaces (1000+ channels/pages) handled efficiently
- [ ] Manual sync triggers work immediately
- [ ] Sync status visible in admin UI
- [ ] Failed syncs logged with detailed errors
- [ ] Consecutive failures trigger admin notifications
- [ ] Sync doesn't impact application performance
- [ ] Sync resumes correctly after interruption
- [ ] Duplicate content not re-ingested
- [ ] Sync logs include items added/updated/deleted counts
- [ ] Works with multiple organizations simultaneously

**Testing Requirements:**
- Test initial sync (no prior data) vs incremental sync
- Test with small workspaces (10 channels/pages) and large (1000+)
- Test sync with new, updated, and deleted content
- Test rate limit handling with simulated 429 errors
- Test scheduler executes on time
- Test manual sync trigger
- Test sync interruption and recovery
- Test concurrent syncs for different organizations
- Integration test with real Slack and Notion workspaces
- Performance test sync duration with various data sizes
- Test sync error handling and notifications

**Dependencies:**
- Task 4.1 (Background Workers) must be complete
- Task 2.1 (Ingestion Pipeline) must be complete
- Slack and Notion OAuth functional ✓
- Redis available for job queue ✓

**Estimated Effort:** 6-7 days

---

### Task 4.3: Implement Slack Nudge Delivery

**Description:** Enable sending nudges to experts via Slack DM when they're matched with a question, creating a seamless notification experience.

**Location:** `/apps/backend/src/services/slack.service.ts` (expand existing)

**Technical Requirements:**
- Send Slack DM when expert matched with nudge
- Include question, context, and attachments
- Provide "Accept" and "Decline" buttons (Slack interactive components)
- Handle button clicks via webhook
- Update nudge status in database based on response
- Notify question asker when expert accepts
- Support fallback to in-app notification if Slack fails
- Respect user preferences (opt-out of Slack notifications)
- Handle Slack workspace not connected gracefully

**Slack Message Format:**
```
📩 New Question for You

[User Name] has a question about [topic]:

"[Question text]"

Context: [Brief context]

Attachments: [Links to files/screenshots]

[Accept Button] [Decline Button]

View full details in Mitable Console
```

**Implementation Steps:**
1. Update `slack.service.ts` with `sendNudge()` method:
   - Accept nudge data (question, context, expert)
   - Find expert's Slack user ID via email
   - Construct message with Block Kit
   - Send DM via `chat.postMessage` API
   - Store Slack message ID in nudge record
2. Implement Slack user lookup:
   - Use `users.lookupByEmail` API
   - Cache user ID → email mapping (TTL: 24 hours)
   - Handle user not found (fallback to in-app only)
3. Design Block Kit message:
   - Use `section` blocks for question and context
   - Use `actions` block for Accept/Decline buttons
   - Include `context` block with timestamp and asker name
   - Add divider for visual separation
4. Implement interactive components:
   - Register webhook endpoint: POST `/api/integrations/slack/interactive`
   - Verify Slack signature for security
   - Parse button click payload
   - Extract action (accept or decline) and nudge ID
   - Update nudge status in database
   - Send confirmation message to expert
   - Notify question asker of expert's response
5. Handle Accept action:
   - Update nudge status to 'accepted'
   - Create DM thread or channel for conversation
   - Notify question asker via Slack and in-app
   - Log interaction in `expert_interactions` table
6. Handle Decline action:
   - Update nudge status to 'declined'
   - Find next best expert match (if available)
   - Send nudge to next expert
   - Notify question asker (generic message, not which expert declined)
7. Add fallback logic:
   - If Slack API fails, create in-app notification
   - Ensure question asker always has a way to get help
   - Log Slack delivery failures
8. Implement user preferences:
   - Add `notification_preferences` table with Slack opt-in/out
   - Respect user's choice (default: opt-in)
   - Provide UI for users to change preference
9. Add delivery tracking:
   - Store delivery attempts in database
   - Track: sent_at, delivered_at, read_at (if possible), responded_at
   - Calculate response rate metrics
10. Update nudge creation flow:
    - After expert match, check if Slack connected
    - If yes, queue notification job
    - If no, create in-app notification only
11. Create notification worker job:
    - Handle async Slack message sending
    - Retry failed sends (3 attempts)
    - Update nudge with delivery status
12. Add admin monitoring:
    - Dashboard showing Slack delivery stats
    - View failed deliveries
    - Retry failed deliveries manually

**Acceptance Criteria:**
- [ ] Experts receive Slack DM when matched with nudge
- [ ] Message includes question, context, and action buttons
- [ ] Accept button updates nudge status and notifies asker
- [ ] Decline button finds next expert and notifies them
- [ ] Interactive webhook verified for security
- [ ] Failed Slack deliveries fallback to in-app notifications
- [ ] User preferences respected (opt-out honored)
- [ ] Delivery tracking shows success/failure rates
- [ ] Response time metrics collected
- [ ] Works with multiple Slack workspaces per org
- [ ] Handles experts not in Slack gracefully
- [ ] Admin can view and retry failed deliveries
- [ ] Slack rate limits respected
- [ ] Message formatting consistent and professional
- [ ] Asker receives notification within 1 minute of expert accepting

**Testing Requirements:**
- Test Slack DM delivery to real users
- Test Accept button interaction
- Test Decline button interaction and next-expert logic
- Test webhook signature verification
- Test fallback to in-app when Slack fails
- Test user opt-out preference
- Test expert not found in Slack scenario
- Test multiple nudges to same expert (no spam)
- Integration test with real Slack workspace
- Load test with 100 simultaneous nudges
- Test notification worker retry logic
- Test delivery tracking accuracy

**Dependencies:**
- Task 4.1 (Background Workers) must be complete
- Slack OAuth and bot setup complete ✓
- Nudge creation system operational ✓
- Slack app has necessary permissions (chat:write, users:read.email)

**Estimated Effort:** 5-6 days

---

## Phase 5: Polish & Production Readiness
**Priority:** MEDIUM  
**Timeline:** Week 7-8  
**Current Status:** Various  
**Impact:** Essential for professional deployment

### Task 5.1: Implement Analytics and Monitoring

**Description:** Add comprehensive analytics tracking and system monitoring to understand usage patterns and system health.

**Location:** `/apps/backend/src/services/analytics.service.ts` (expand existing)

**Technical Requirements:**
- Track user actions: help requests, roadmap completions, nudge interactions, chats
- Track system metrics: response times, error rates, API usage
- Store events in `analytics_events` table
- Implement real-time dashboard with key metrics
- Set up alerting for critical issues
- Track conversion funnel: onboarding → engagement → retention
- Integrate with external analytics (optional: Mixpanel, Amplitude)
- Privacy-respecting: no PII in events

**Key Metrics to Track:**

**User Engagement:**
- Daily/weekly/monthly active users
- Help requests per user per day
- Roadmap task completion rate
- Nudge response rate and time-to-respond
- Chat message count and conversation length
- Feature adoption rates (overlay, search, integrations)

**System Performance:**
- API response time (p50, p95, p99)
- Screenshot capture latency
- UI detection latency
- LLM response time
- Search query latency
- Error rate by endpoint and type
- Queue job processing time

**Business Metrics:**
- New user onboarding completion rate
- Time to first value (first help request)
- User retention (D1, D7, D30)
- Feature usage distribution
- Expert matching success rate
- Integration connection rate

**Implementation Steps:**
1. Expand `analytics.service.ts`:
   - `trackEvent(userId, eventName, properties)`
   - `trackMetric(metricName, value, tags)`
   - `getMetrics(timeRange, filters)`
   - `getDashboard()`: Return pre-computed dashboard data
2. Define event schema:
   ```typescript
   {
     event_id: uuid,
     user_id: uuid,
     org_id: uuid,
     event_name: string, // e.g., 'help_request_created'
     event_properties: json, // Additional context
     timestamp: timestamptz,
     session_id: uuid,
     device_info: json // OS, browser, etc.
   }
   ```
3. Instrument key user flows:
   - Help request flow (capture, detection, overlay, response)
   - Roadmap task completion
   - Nudge creation and interaction
   - Chat conversations
   - Integration connections
   - Search queries
4. Implement automatic metric collection:
   - Express middleware for request timing
   - Database query timing
   - External API call timing
   - Error tracking
5. Create analytics dashboard:
   - Real-time metrics (last hour, today)
   - Trend charts (daily, weekly, monthly)
   - Funnel visualizations
   - Cohort analysis (retention)
   - Top users and organizations
6. Implement aggregation jobs:
   - Daily rollup of events into summary tables
   - Pre-compute common queries for fast dashboard loading
   - Scheduler runs aggregation at midnight
7. Add alerting system:
   - Email/Slack alerts for critical issues:
     - Error rate >5% for 5 minutes
     - API response time >2s (p95) for 10 minutes
     - Zero help requests for 1 hour (system broken?)
     - Failed background jobs >10 in 1 hour
   - Use services like PagerDuty or custom webhook
8. Integrate external analytics (optional):
   - Set up Mixpanel or Amplitude
   - Send events via client SDK and server SDK
   - Implement event batching for performance
9. Implement privacy controls:
   - Anonymize user identifiers in events
   - Allow org admins to opt out of analytics
   - No sensitive data in event properties
10. Create admin analytics UI:
    - Embed dashboard in Console window
    - Filter by date range, user, organization
    - Export data to CSV
11. Add performance monitoring:
    - Use New Relic, DataDog, or open-source alternative
    - Track server CPU, memory, disk usage
    - Track database connection pool metrics
    - Track Redis queue metrics
12. Document metrics and definitions:
    - Create metrics glossary
    - Explain how each metric is calculated
    - Provide interpretation guidelines

**Acceptance Criteria:**
- [ ] All key user actions tracked and stored
- [ ] Analytics dashboard shows real-time and historical data
- [ ] Dashboard loads in <2 seconds
- [ ] Alerts trigger for critical issues within 5 minutes
- [ ] Retention metrics calculated correctly (cohort analysis)
- [ ] Performance metrics track API and external service latency
- [ ] Error tracking shows top errors by frequency
- [ ] Admin can filter analytics by date, user, organization
- [ ] Analytics data exports to CSV
- [ ] External analytics integration sends events (if configured)
- [ ] No PII stored in analytics events
- [ ] Event tracking has <1% overhead on API performance
- [ ] Dashboard accessible to org admins only
- [ ] Alerting system tested and working
- [ ] Metrics documented and understandable

**Testing Requirements:**
- Simulate user flows and verify events tracked
- Test dashboard with various date ranges and filters
- Test aggregation jobs with large datasets
- Test alerting with simulated critical issues
- Performance test analytics queries (should be <500ms)
- Test CSV export with large result sets
- Test privacy controls (opt-out, anonymization)
- Load test event ingestion (1000 events/second)
- Verify external analytics integration (if used)
- User testing: Do admins understand the dashboard?

**Dependencies:**
- `analytics_events` table exists ✓
- Dashboard UI space in Console window ✓

**Estimated Effort:** 6-7 days

---

### Task 5.2: Optimize Performance and Scalability

**Description:** Profile and optimize the application for production load, ensuring fast response times and efficient resource usage.

**Location:** All backend services, database, and Electron app

**Technical Requirements:**
- API response times: p95 <500ms, p99 <1s
- Database query optimization: All queries <100ms
- Frontend bundle size: <2MB per window
- Memory usage: Backend <512MB per process, Electron <300MB per window
- Support 100+ concurrent users per organization
- Implement caching strategies (Redis, in-memory)
- Optimize database indexes
- Implement connection pooling
- Lazy load frontend components
- Use CDN for static assets (production)

**Optimization Areas:**

**Backend API:**
- Profile endpoints with high latency
- Add database indexes for common queries
- Implement query result caching (Redis)
- Use database connection pooling (already configured?)
- Optimize N+1 queries (use joins or batch loading)
- Compress API responses (gzip)
- Implement rate limiting per user

**Database:**
- Add indexes for frequently queried columns
- Analyze slow query log
- Optimize expensive queries (e.g., analytics aggregations)
- Partition large tables (e.g., `analytics_events` by month)
- Implement read replicas for analytics queries (future)
- Vacuum and analyze tables regularly

**Vector Store:**
- Optimize Pinecone query latency
- Reduce dimension size if possible (test impact on accuracy)
- Implement query result caching
- Batch embed requests to reduce API calls

**Frontend:**
- Code-split large components
- Lazy load window renderers
- Optimize bundle size (tree-shaking, minification)
- Implement virtual scrolling for long lists
- Debounce user inputs (search, typeahead)
- Cache static assets aggressively

**Caching Strategy:**
- Cache search results (TTL: 10 minutes)
- Cache integration data (TTL: 1 hour)
- Cache user profiles (TTL: 30 minutes)
- Cache roadmap templates (TTL: 1 hour)
- Invalidate cache on relevant updates

**Implementation Steps:**
1. Set up performance monitoring:
   - Install profiling tools (clinic.js, autocannon for load testing)
   - Monitor with New Relic or DataDog
   - Set up continuous performance benchmarking
2. Profile backend API:
   - Identify slowest endpoints
   - Profile with `node --inspect` and Chrome DevTools
   - Identify CPU and memory bottlenecks
3. Optimize database queries:
   - Review slow query log
   - Add indexes for common filters (WHERE, JOIN, ORDER BY)
   - Indexes to add:
     ```sql
     CREATE INDEX idx_users_org_id ON users(organization_id);
     CREATE INDEX idx_messages_conv_id ON messages(conversation_id);
     CREATE INDEX idx_nudges_status ON nudges(status, created_at);
     CREATE INDEX idx_analytics_events_user_date ON analytics_events(user_id, timestamp);
     CREATE INDEX idx_source_materials_org_type ON source_materials(organization_id, type);
     ```
   - Use `EXPLAIN ANALYZE` to verify improvement
4. Implement Redis caching:
   - Set up Redis client
   - Cache expensive queries (search, analytics)
   - Implement cache-aside pattern
   - Set appropriate TTLs
5. Optimize vector search:
   - Reduce query dimensions if possible
   - Cache frequent queries
   - Use Pinecone's namespace filtering
6. Frontend bundle optimization:
   - Analyze bundle size with `vite-bundle-visualizer`
   - Code-split routes and heavy components
   - Lazy load windows on demand
   - Tree-shake unused dependencies
7. Implement connection pooling:
   - Configure Postgres pool size (max: 20)
   - Monitor active/idle connections
8. Add rate limiting:
   - Use `express-rate-limit` middleware
   - Limit: 100 requests per minute per user
   - Higher limits for admins
9. Compress responses:
   - Enable gzip compression middleware
   - Compress API responses >1KB
10. Optimize LLM calls:
    - Reduce prompt size where possible
    - Use smaller models for simple tasks
    - Cache responses for identical queries
11. Load testing:
    - Use `artillery` or `k6` for load tests
    - Simulate 100 concurrent users
    - Test peak load scenarios (all users login at once)
    - Identify breaking points
12. Memory profiling:
    - Use `heapdump` to capture memory snapshots
    - Identify memory leaks
    - Optimize object creation in hot paths
13. Benchmark critical paths:
    - Help request flow (target: <5s end-to-end)
    - Search query (target: <500ms)
    - Roadmap load (target: <200ms)
    - Chat message send (target: <1s)
14. Document performance baseline:
    - Record metrics before and after optimization
    - Set performance budgets for future development

**Acceptance Criteria:**
- [ ] API p95 response time <500ms for all endpoints
- [ ] Database queries <100ms (90th percentile)
- [ ] Search queries return in <500ms
- [ ] Help request flow completes in <5s (end-to-end)
- [ ] Frontend bundle size <2MB per window
- [ ] No memory leaks detected (heap stable over 1 hour)
- [ ] Backend memory usage <512MB per process
- [ ] Electron window memory <300MB per window
- [ ] Supports 100 concurrent users without degradation
- [ ] Database connection pool not exhausted under load
- [ ] Redis cache hit rate >70% for frequent queries
- [ ] Load test passes with 100 concurrent users
- [ ] No slow queries in database log (>1s)
- [ ] Frontend renders in <1s on cold start
- [ ] Performance regression tests in CI/CD pipeline

**Testing Requirements:**
- Load test with 50, 100, 200 concurrent users
- Stress test to find breaking point
- Endurance test (8 hours continuous load)
- Memory leak test (24 hours with memory snapshots)
- Database performance test (1M+ rows)
- Frontend rendering performance test (large datasets)
- Cache effectiveness test (hit rate measurement)
- Test on low-end hardware (minimum system requirements)
- Network latency simulation (slow connections)
- Compare before/after metrics for each optimization

**Dependencies:**
- All core features implemented
- Production-like environment for testing

**Estimated Effort:** 7-8 days

---

### Task 5.3: Security Audit and Hardening

**Description:** Conduct comprehensive security review and implement additional hardening measures for production deployment.

**Location:** All application layers

**Technical Requirements:**
- Fix all high and critical vulnerabilities
- Implement input validation and sanitization
- Add CSRF protection
- Implement rate limiting
- Secure API endpoints with proper authentication
- Add security headers (CSP, HSTS, etc.)
- Encrypt sensitive data at rest and in transit
- Implement audit logging
- Follow OWASP Top 10 best practices
- Pass security scan (e.g., OWASP ZAP)

**Security Checklist:**

**Authentication & Authorization:**
- [ ] All API endpoints require authentication (except public routes)
- [ ] Role-based access control (admin vs user)
- [ ] JWT tokens properly validated and secured
- [ ] Token expiration and refresh implemented
- [ ] No hardcoded credentials in code
- [ ] Secure password hashing (bcrypt with salt)
- [ ] Account lockout after failed login attempts
- [ ] Session timeout after inactivity

**Input Validation:**
- [ ] All user inputs validated and sanitized
- [ ] SQL injection protection (use parameterized queries)
- [ ] XSS protection (escape HTML output)
- [ ] Path traversal protection
- [ ] File upload validation (type, size, content)
- [ ] API request payload size limits
- [ ] Regex DoS protection (avoid complex regex on user input)

**Data Protection:**
- [ ] Sensitive data encrypted at rest (tokens, API keys)
- [ ] HTTPS enforced for all communications
- [ ] Database credentials stored in environment variables
- [ ] No sensitive data in logs or error messages
- [ ] Personal data anonymized in analytics
- [ ] Secure token storage (HTTP-only cookies or encrypted local storage)

**API Security:**
- [ ] CORS configured correctly (whitelist trusted origins)
- [ ] Rate limiting implemented (prevent brute force, DoS)
- [ ] CSRF protection for state-changing operations
- [ ] API versioning for backward compatibility
- [ ] Request signing/verification for webhooks

**Security Headers:**
- [ ] Content-Security-Policy (CSP)
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Strict-Transport-Security (HSTS)
- [ ] Referrer-Policy: no-referrer

**Dependency Security:**
- [ ] All dependencies up-to-date
- [ ] No known vulnerabilities (`npm audit`)
- [ ] Dependabot enabled for automatic updates
- [ ] Minimal dependency footprint

**Electron-Specific:**
- [ ] Context isolation enabled
- [ ] Node integration disabled in renderers
- [ ] Preload scripts properly sandboxed
- [ ] Remote module disabled
- [ ] Webview security configured
- [ ] Deep link handling secure

**Audit & Logging:**
- [ ] Security events logged (auth failures, permission denied)
- [ ] Audit trail for sensitive operations
- [ ] Log retention policy defined
- [ ] Logs protected from tampering
- [ ] PII excluded from logs

**Implementation Steps:**
1. Run automated security scan:
   - Use OWASP ZAP or similar tool
   - Scan all API endpoints
   - Review findings and prioritize fixes
2. Fix dependency vulnerabilities:
   - Run `npm audit fix`
   - Manually update critical dependencies
   - Review and test changes
3. Implement input validation library:
   - Use `joi`, `yup`, or `zod` for schema validation
   - Validate all API inputs
   - Sanitize user inputs before storing/displaying
4. Add security headers:
   - Use `helmet` middleware in Express
   - Configure CSP for Electron windows
   - Test headers with securityheaders.com
5. Implement rate limiting:
   - Use `express-rate-limit`
   - Different limits for auth (5/min) vs API (100/min)
   - Store rate limit state in Redis
6. Add CSRF protection:
   - Use `csurf` middleware
   - Include CSRF token in forms
   - Validate token on state-changing requests
7. Review authentication/authorization:
   - Audit all endpoints for proper auth checks
   - Implement role-based middleware
   - Test with unauthorized users
8. Secure Electron configuration:
   - Review and update Electron security best practices
   - Test with `electronegativity` tool
   - Fix identified issues
9. Implement audit logging:
   - Log sensitive operations (user creation, permission changes)
   - Store audit logs separately from application logs
   - Implement log rotation and retention
10. Encrypt additional sensitive data:
    - Review database for unencrypted sensitive fields
    - Encrypt as needed (beyond tokens)
11. Penetration testing (if budget allows):
    - Hire security firm or use bug bounty program
    - Address findings
12. Document security practices:
    - Create security policy document
    - Responsible disclosure process
    - Incident response plan
13. Security training:
    - Review security best practices with team
    - Establish secure coding guidelines

**Acceptance Criteria:**
- [ ] No high or critical vulnerabilities in security scan
- [ ] All OWASP Top 10 risks mitigated
- [ ] Input validation implemented for all user inputs
- [ ] Security headers configured correctly
- [ ] Rate limiting prevents brute force attacks
- [ ] CSRF protection prevents cross-site attacks
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Electron security best practices followed
- [ ] Audit logging captures security events
- [ ] Dependencies have no known vulnerabilities
- [ ] Authentication and authorization properly enforced
- [ ] Security scan score >A (securityheaders.com)
- [ ] Passes penetration testing (if conducted)
- [ ] Security documentation complete
- [ ] Team trained on security practices

**Testing Requirements:**
- Automated security scan (OWASP ZAP, Burp Suite)
- Manual penetration testing
- Test authentication/authorization edge cases
- Test input validation with malicious payloads
- Test rate limiting effectiveness
- Test CSRF protection
- Test encryption at rest and in transit
- Test Electron security configuration
- Code review focused on security
- Review all third-party dependencies

**Dependencies:**
- Task 3.1 (Token Encryption) must be complete
- Task 3.3 (Error Handling) must be complete

**Estimated Effort:** 6-7 days

---

### Task 5.4: Create Deployment and CI/CD Pipeline

**Description:** Set up automated build, test, and deployment pipeline for reliable production releases.

**Location:** Root directory (GitHub Actions, Docker configs)

**Technical Requirements:**
- Automated builds on every commit
- Run tests (unit, integration, e2e) in CI
- Automated security scanning
- Build Electron installers for macOS and Windows
- Deploy backend to production server (AWS, GCP, or similar)
- Blue-green deployment or rolling updates
- Automated database migrations
- Environment-specific configurations
- Rollback capability
- Deployment notifications (Slack, email)

**CI/CD Pipeline Stages:**
```
1. Code Commit → GitHub
    ↓
2. CI Triggers (GitHub Actions)
    ↓
3. Install Dependencies
    ↓
4. Lint and Type Check
    ↓
5. Run Unit Tests
    ↓
6. Run Integration Tests
    ↓
7. Build Backend (Docker)
    ↓
8. Build Electron App (macOS, Windows)
    ↓
9. Security Scan (npm audit, OWASP ZAP)
    ↓
10. Deploy to Staging
    ↓
11. Run E2E Tests on Staging
    ↓
12. Manual Approval (for production)
    ↓
13. Deploy to Production
    ↓
14. Run Smoke Tests
    ↓
15. Notify Team (Slack)
```

**Implementation Steps:**
1. Set up GitHub Actions:
   - Create `.github/workflows/ci.yml` for continuous integration
   - Create `.github/workflows/deploy-staging.yml` for staging deployment
   - Create `.github/workflows/deploy-production.yml` for production deployment
2. Implement CI workflow:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     build-and-test:
       runs-on: ubuntu-latest
       steps:
         - Checkout code
         - Setup Node.js
         - Install dependencies
         - Run linter (ESLint)
         - Run type checker (TypeScript)
         - Run unit tests (Jest/Vitest)
         - Run integration tests
         - Build backend
         - Build Electron app
         - Run security audit
         - Upload artifacts
   ```
3. Set up Docker for backend:
   - Create `Dockerfile` for backend API
   - Multi-stage build for optimization
   - Create `docker-compose.yml` for local development
   - Configure environment variables
4. Implement database migrations:
   - Use Drizzle migrations (already set up?)
   - Automate migration on deployment
   - Add rollback script
   - Test migrations on staging before production
5. Configure environment management:
   - Create `.env.staging` and `.env.production` templates
   - Use GitHub Secrets for sensitive values
   - Implement environment-specific configs
   - Document all required environment variables
6. Set up staging environment:
   - Deploy to staging server (AWS EC2, Heroku, or similar)
   - Configure domain: `staging.mitable.app`
   - Set up SSL certificate (Let's Encrypt)
   - Configure logging and monitoring
7. Implement deployment script:
   - Build Docker image
   - Push to container registry (Docker Hub, AWS ECR)
   - Pull image on server
   - Run database migrations
   - Start new containers (blue-green deployment)
   - Health check
   - Switch traffic to new deployment
   - Keep old deployment for quick rollback
8. Build Electron installers:
   - Use `electron-builder` (already configured?)
   - Build for macOS (Intel + Apple Silicon)
   - Build for Windows (x64)
   - Sign binaries (code signing certificates)
   - Upload to release storage (S3 or GitHub Releases)
   - Create auto-update manifest
9. Implement E2E tests:
   - Use Playwright or Cypress
   - Test critical user flows:
     - Login
     - Help request (screenshot → overlay)
     - Chat conversation
     - Roadmap task completion
     - Nudge creation
   - Run E2E tests on staging
10. Set up production deployment:
    - Blue-green deployment strategy
    - Health checks before traffic switch
    - Automated rollback on failure
    - Deploy API and Electron app simultaneously
11. Implement rollback mechanism:
    - Keep previous Docker images
    - Script to revert to previous version
    - Database migration rollback (if needed)
    - Test rollback procedure
12. Add deployment notifications:
    - Slack webhook for deployment events
    - Email notifications for failures
    - Include deployment details (version, changes, status)
13. Set up monitoring post-deployment:
    - Health check endpoint: `/api/health`
    - Monitor error rates for 1 hour post-deploy
    - Alert on anomalies
14. Document deployment process:
    - Step-by-step deployment guide
    - Environment setup instructions
    - Troubleshooting common issues
    - Rollback procedure
15. Implement auto-update for Electron app:
    - Use `electron-updater`
    - Check for updates on app start
    - Notify user of available updates
    - Download and install updates in background
    - Support silent updates (for minor versions)

**Acceptance Criteria:**
- [ ] CI pipeline runs on every commit and PR
- [ ] All tests pass in CI before deployment
- [ ] Security scans block deployment if critical issues found
- [ ] Backend Docker images built and pushed to registry
- [ ] Electron installers built for macOS and Windows
- [ ] Staging deployment automated on merge to `develop` branch
- [ ] Production deployment requires manual approval
- [ ] Database migrations run automatically on deployment
- [ ] Blue-green deployment minimizes downtime (<10s)
- [ ] Health checks confirm successful deployment
- [ ] Rollback completes in <5 minutes
- [ ] Deployment notifications sent to Slack
- [ ] E2E tests pass on staging before production deploy
- [ ] Auto-update works for Electron app
- [ ] Deployment documentation complete and tested
- [ ] Failed deployments automatically roll back
- [ ] Production environment has SSL certificate
- [ ] Logs and monitoring active post-deployment

**Testing Requirements:**
- Test entire CI/CD pipeline end-to-end
- Test staging deployment from scratch
- Test production deployment from staging
- Test rollback procedure (simulate failed deployment)
- Test database migration and rollback
- Test Electron auto-update mechanism
- Test deployment notifications
- Test blue-green deployment traffic switch
- Test health checks and failure scenarios
- Test build artifacts (installers install correctly)

**Dependencies:**
- All application features complete
- Staging and production servers provisioned
- Docker and container registry set up
- Domain names and SSL certificates configured
- Code signing certificates for Electron (optional but recommended)

**Estimated Effort:** 8-10 days

---

## Phase 6: Documentation and Launch Preparation
**Priority:** LOW (but essential for launch)  
**Timeline:** Week 8+  
**Current Status:** Minimal  
**Impact:** Enables successful user onboarding and support

### Task 6.1: Create User Documentation

**Description:** Write comprehensive user guides, tutorials, and help articles for employees and admins.

**Location:** `/docs/user-guides/` (new directory)

**Documentation Structure:**
```
/docs/user-guides/
├── employee/
│   ├── getting-started.md
│   ├── using-the-agent.md
│   ├── managing-roadmap.md
│   ├── chatting-with-ai.md
│   ├── creating-nudges.md
│   ├── troubleshooting.md
│   └── faq.md
├── admin/
│   ├── getting-started.md
│   ├── creating-templates.md
│   ├── managing-employees.md
│   ├── connecting-integrations.md
│   ├── monitoring-analytics.md
│   └── best-practices.md
└── developer/
    ├── architecture.md (already exists)
    ├── api-reference.md
    ├── deployment-guide.md
    ├── contributing.md
    └── changelog.md
```

**Employee Guides:**
1. **Getting Started:**
   - First login
   - Understanding the Agent window
   - Setting up your profile
2. **Using the Agent:**
   - Pressing Cmd+H for help
   - Understanding visual overlays
   - Asking effective questions
3. **Managing Your Roadmap:**
   - Viewing tasks
   - Completing tasks
   - Adding custom tasks
   - Tracking progress
4. **Chatting with AI:**
   - Starting conversations
   - Effective prompting
   - Using conversation history
   - Understanding AI limitations
5. **Creating Nudges:**
   - When to ask for help
   - Providing context
   - Attaching files
   - Interacting with experts

**Admin Guides:**
1. **Getting Started:**
   - Admin dashboard overview
   - Key responsibilities
   - First-time setup
2. **Creating Templates:**
   - Manual template creation
   - Importing from Notion
   - Organizing tasks by week
   - Linking source materials
3. **Managing Employees:**
   - Adding new employees
   - Assigning templates
   - Monitoring progress
   - Handling issues
4. **Connecting Integrations:**
   - Slack OAuth setup
   - Notion OAuth setup
   - Managing sync schedules
   - Troubleshooting connection issues
5. **Monitoring Analytics:**
   - Understanding dashboard metrics
   - Identifying usage patterns
   - Measuring ROI
   - Exporting reports

**Implementation Steps:**
1. Write employee documentation (5-6 guides)
2. Write admin documentation (5-6 guides)
3. Create developer documentation (API reference, deployment guide)
4. Add screenshots and GIFs for visual guidance
5. Create video tutorials for key flows (optional)
6. Implement in-app help links to documentation
7. Create searchable knowledge base (host on Notion, GitBook, or custom)
8. Add tooltips in UI for common questions
9. Create onboarding checklist for new users
10. Write troubleshooting guide with common issues
11. Create FAQ page
12. Get feedback from beta users and iterate

**Acceptance Criteria:**
- [ ] All employee guides written and reviewed
- [ ] All admin guides written and reviewed
- [ ] Developer documentation complete
- [ ] Screenshots and GIFs illustrate key concepts
- [ ] Documentation hosted and accessible (public URL)
- [ ] In-app links to relevant documentation
- [ ] Searchable knowledge base implemented
- [ ] Tooltips added for common UI elements
- [ ] Onboarding checklist created
- [ ] Troubleshooting guide covers top 10 issues
- [ ] FAQ answers top 20 questions
- [ ] Beta users confirm documentation is helpful
- [ ] Documentation reviewed for clarity and accuracy
- [ ] No broken links or missing images
- [ ] Documentation versioned with app releases

**Testing Requirements:**
- Peer review all documentation
- User testing: Can new users complete tasks using guides?
- Test all links and screenshots
- Test search functionality in knowledge base
- Get feedback from non-technical users
- Ensure documentation matches current app version

**Dependencies:**
- All core features implemented
- Beta testing underway or complete

**Estimated Effort:** 5-6 days

---

### Task 6.2: Conduct Beta Testing

**Description:** Run structured beta test program with real users to identify issues, gather feedback, and validate product-market fit.

**Location:** N/A (process, not code)

**Beta Testing Plan:**

**Objectives:**
- Validate core use cases work end-to-end
- Identify bugs and usability issues
- Gather product feedback
- Measure user satisfaction and retention
- Test on various hardware/OS configurations

**Beta Program Structure:**
- **Duration:** 3-4 weeks
- **Participants:** 15-25 users across 3-5 organizations
- **Mix:** 80% employees, 20% admins
- **Recruitment:** Outreach to early customers, personal network, beta signup form

**Testing Phases:**
1. **Week 1: Onboarding and First Impressions**
   - Goal: Test setup, first-time experience, learning curve
   - Tasks: Install app, connect integrations, complete first roadmap task, ask first question
   - Metrics: Time to first value, completion rate, error rate
2. **Week 2: Daily Usage**
   - Goal: Test real-world usage patterns, performance, reliability
   - Tasks: Daily help requests, roadmap progression, chat conversations
   - Metrics: Daily active users, help requests per day, response satisfaction
3. **Week 3: Advanced Features**
   - Goal: Test nudges, integrations, admin features
   - Tasks: Create nudges, sync integrations, create templates
   - Metrics: Feature adoption, expert matching success rate
4. **Week 4: Feedback and Iteration**
   - Goal: Gather qualitative feedback, validate fixes
   - Tasks: User interviews, surveys, final testing of improvements
   - Metrics: NPS score, feature requests, bug reports

**Data Collection:**
- **Automated:** Analytics (usage, errors, performance)
- **Surveys:** Weekly feedback surveys (SurveyMonkey, Typeform)
- **Interviews:** 1-on-1 interviews with 5-10 users
- **Bug Reports:** In-app bug reporting (or GitHub issues)
- **Support Tickets:** Track questions and issues via email/Slack

**Implementation Steps:**
1. Create beta program landing page:
   - Explain program goals and timeline
   - Sign-up form
   - Eligibility criteria
   - Link to documentation
2. Recruit beta testers:
   - Email outreach to warm leads
   - Post on social media (LinkedIn, Twitter)
   - Reach out to personal network
   - Offer incentives (free months, swag)
3. Create onboarding materials for beta:
   - Welcome email with setup instructions
   - Video walkthrough of key features
   - Slack channel or Discord for beta community
   - Direct line to support team
4. Set up feedback mechanisms:
   - Weekly surveys (automated via email)
   - In-app feedback button (link to form or support email)
   - Bug report template
   - Feature request board (Canny, ProductBoard)
5. Provide white-glove support:
   - Respond to all questions within 2 hours
   - Schedule office hours for live Q&A
   - Fix critical bugs within 24 hours
6. Monitor usage closely:
   - Daily review of analytics
   - Weekly check-ins with each organization
   - Track blockers and drop-offs
7. Conduct user interviews:
   - Schedule 30-min interviews with diverse users
   - Ask about pain points, workflows, feature requests
   - Understand "why" behind usage patterns
8. Iterate based on feedback:
   - Prioritize bug fixes and quick wins
   - Deploy fixes to beta continuously
   - Communicate changes to beta users
9. Run usability testing sessions:
   - Watch users perform tasks (screen share)
   - Identify confusion points
   - Test new features before wider release
10. Measure key success metrics:
    - Activation rate (% who complete onboarding)
    - Retention rate (D1, D7, D30)
    - Net Promoter Score (NPS)
    - Feature satisfaction ratings
    - Time to value (first successful help request)
11. Synthesize feedback:
    - Categorize all feedback (bugs, features, usability)
    - Identify patterns and themes
    - Prioritize for post-beta roadmap
12. Prepare for public launch:
    - Fix all critical bugs
    - Implement top feature requests (if feasible)
    - Validate product-market fit
    - Gather testimonials from happy beta users

**Acceptance Criteria:**
- [ ] 15+ users enrolled in beta program
- [ ] All users successfully onboard and complete first task
- [ ] >70% of users active daily during Week 2
- [ ] >80% of critical bugs identified and fixed
- [ ] >50 pieces of feedback collected (surveys, interviews, bug reports)
- [ ] NPS score >40 (good) or >70 (excellent)
- [ ] Retention rate: >60% D7, >40% D30
- [ ] Feature satisfaction ratings >4/5 for core features
- [ ] User testimonials collected (at least 5)
- [ ] Usability issues identified and prioritized
- [ ] Product-market fit validated (users express strong desire for product)
- [ ] No showstopper bugs remaining
- [ ] Feedback synthesized into actionable roadmap
- [ ] Beta users willing to continue as paying customers
- [ ] Beta program documentation complete (for future betas)

**Testing Requirements:**
- Test on macOS (Intel and Apple Silicon)
- Test on Windows 10 and 11
- Test in small orgs (1-10 users) and medium orgs (10-50 users)
- Test with various integration setups (Slack only, Notion only, both)
- Test with different user roles (engineers, sales, marketing, etc.)
- Test in different use cases (technical onboarding, general onboarding, training)

**Dependencies:**
- All MVP features complete
- Documentation complete (Task 6.1)
- Deployment pipeline operational (Task 5.4)
- Monitoring and analytics in place (Task 5.1)

**Estimated Effort:** 3-4 weeks (concurrent with development)

---

### Task 6.3: Prepare Marketing and Launch Materials

**Description:** Create marketing website, demo videos, and launch plan to support public release.

**Location:** Marketing site repo (separate from main app)

**Marketing Assets:**

**Website (landing page):**
- Hero section with value proposition
- Feature highlights (visual guidance, AI chat, expert matching)
- Screenshots and demo video
- Customer testimonials (from beta)
- Pricing page
- Sign-up form
- FAQ section
- Blog (optional, for content marketing)

**Demo Video:**
- 2-3 minute product demo
- Show key workflows:
  - New employee logs in
  - Presses Cmd+H for help
  - Visual overlay guides them
  - Chats with AI
  - Creates nudge
  - Expert responds
- Professional voiceover and editing
- Host on YouTube and embed on site

**Launch Plan:**
- **Launch Date:** TBD (post-beta)
- **Channels:**
  - Product Hunt launch
  - LinkedIn posts (founders, team)
  - Twitter thread
  - Email to waitlist (collect emails during beta)
  - Tech blogs (TechCrunch, The Verge - if lucky)
  - Reddit (r/startups, r/SaaS)
- **Content:**
  - Launch blog post
  - Press release
  - Social media graphics
  - Email announcement templates
- **Goals:**
  - 500+ signups in first week
  - Product Hunt top 10
  - 50+ trial organizations

**Implementation Steps:**
1. Design landing page:
   - Hire designer or use template (Webflow, Framer)
   - Write copy emphasizing benefits (not features)
   - Create high-quality screenshots
   - Add social proof (beta testimonials, logos if any)
2. Build landing page:
   - Use static site generator (Next.js, Astro) or no-code tool
   - Implement sign-up form (email capture)
   - Add analytics (Google Analytics, Plausible)
   - Optimize for SEO (meta tags, sitemap)
3. Create demo video:
   - Write script
   - Record screen captures
   - Add voiceover and music
   - Edit professionally (hire freelancer if needed)
   - Publish on YouTube
4. Collect beta testimonials:
   - Ask happy beta users for quotes
   - Request permission to use name/company
   - Take screenshot of positive feedback
5. Write launch content:
   - Blog post: "Introducing Mitable"
   - Social media posts (LinkedIn, Twitter)
   - Email announcement for waitlist
   - Press release (for larger outlets)
6. Create Product Hunt listing:
   - Compelling tagline
   - Clear description
   - Screenshots and demo video
   - Prepare for launch day engagement
7. Set up email marketing:
   - Email tool (Mailchimp, SendGrid)
   - Welcome email sequence
   - Onboarding email series
   - Product updates newsletter
8. Plan launch day activities:
   - Post on all social channels
   - Email waitlist
   - Submit to Product Hunt (best time: 12:01 AM PST)
   - Engage with comments and feedback
   - Monitor signups and traffic
9. Prepare customer support:
   - Set up support email (support@mitable.app)
   - Create templates for common questions
   - Schedule team availability for launch day
10. Plan post-launch content:
    - Blog posts on use cases, best practices
    - Customer success stories
    - Feature announcements
11. Set up tracking:
    - Track signups, trial starts, conversions
    - Monitor website traffic sources
    - Measure launch success against goals

**Acceptance Criteria:**
- [ ] Landing page live and optimized for conversions
- [ ] Demo video published and embedded on site
- [ ] 5+ beta testimonials collected and displayed
- [ ] Sign-up form captures emails correctly
- [ ] Launch content written and scheduled
- [ ] Product Hunt listing prepared
- [ ] Email marketing tool set up with sequences
- [ ] Support infrastructure ready for inquiries
- [ ] Launch day plan documented and team aligned
- [ ] Analytics tracking signups and traffic
- [ ] Social media posts scheduled
- [ ] Press release drafted (even if not distributed)
- [ ] FAQ page answers common questions
- [ ] Website loads fast (<2s) and is mobile-responsive
- [ ] SEO optimized (meta tags, Open Graph tags)

**Testing Requirements:**
- Test landing page on multiple devices and browsers
- Test sign-up form submission
- Proofread all content for errors
- Test video playback on various platforms
- Test email sequences (send to test accounts)
- Get feedback on copy and design from non-team members

**Dependencies:**
- Beta testing complete (Task 6.2)
- Testimonials collected
- Product stable and ready for public use

**Estimated Effort:** 5-7 days (plus outsourcing time for design/video)

---

## Summary: Path to 100% MVP

### Timeline Overview
```
Week 1-2:  Phase 1 - Visual Guidance (CRITICAL PATH)
Week 3-4:  Phase 2 - Knowledge Base
Week 5:    Phase 3 - Security
Week 6:    Phase 4 - Real-time Integrations
Week 7-8:  Phase 5 - Polish & Production Readiness
Week 8+:   Phase 6 - Documentation & Launch
```

### Total Estimated Effort
- **Phase 1:** 18-22 days
- **Phase 2:** 15-18 days
- **Phase 3:** 15-18 days
- **Phase 4:** 16-19 days
- **Phase 5:** 27-32 days
- **Phase 6:** 13-17 days (some concurrent with Phase 5)

**Total:** ~8-10 weeks with 1-2 developers working in parallel

### Critical Success Factors
1. **Visual Guidance System:** Must work flawlessly - it's the core differentiator
2. **Performance:** Fast response times critical for user satisfaction
3. **Security:** Cannot launch without proper token encryption and security hardening
4. **Documentation:** Users won't succeed without clear guidance
5. **Beta Feedback:** Validate product-market fit before public launch

### Risk Mitigation
- **Gemini Vision API reliability:** Have fallback to text-only help if vision fails
- **Performance at scale:** Load test early and often
- **Complex dependencies:** Implement feature flags to deploy incrementally
- **Beta user recruitment:** Start outreach early, offer strong incentives
- **Timeline slippage:** Build buffer into schedule, prioritize ruthlessly

### Definition of "Done" for MVP
- [ ] All Phase 1-3 tasks complete (100%)
- [ ] All Phase 4 tasks complete (>90%)
- [ ] All Phase 5 tasks complete (>80%)
- [ ] All Phase 6 tasks complete (>80%)
- [ ] Beta testing shows positive results (NPS >40, retention >60% D7)
- [ ] No critical bugs remaining
- [ ] Documentation complete and helpful
- [ ] Performance meets targets (p95 <500ms)
- [ ] Security audit passed
- [ ] Marketing site live
- [ ] Ready for public launch 🚀

---

**End of Document**

This comprehensive task list provides the detailed roadmap to take Mitable from 65-70% complete to 100% MVP ready for launch. Each task includes clear acceptance criteria, testing requirements, and dependencies to ensure successful execution.
