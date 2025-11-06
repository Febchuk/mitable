# Query Test Suite

Automated testing for the RAG Knowledge Agent across different query categories.

## Quick Start

1. **Make sure your backend is running:**

   ```bash
   npm run dev
   ```

2. **Run the tests (in a new terminal):**

   ```bash
   # Sequential execution (one query at a time)
   npm run test:queries

   # Parallel execution (3 queries at a time - faster!)
   npm run test:queries:parallel
   ```

3. **Check the results:**
   - Results are written to `query_test/output.md`
   - Each query shows the AI's full response and duration

## Query Categories

The test suite covers 8 categories:

1. **Status / progress queries** - Aggregating discussions and decisions
2. **Procedural / how-to queries** - Finding operational guidance
3. **Decision / rationale queries** - Summarizing key choices
4. **Cross-topic synthesis** - Combining info across channels
5. **Temporal change / comparison** - Validating temporal filters
6. **Knowledge-gap fallbacks** - Testing general knowledge heuristic
7. **Detail-expansion prompts** - Drill-down functionality
8. **Ambiguous or incomplete queries** - Confidence gating

## Adding New Queries

Edit `Queries_test.md` and add queries in quotes:

```markdown
1. Your Category Name

"Your query here?"

"Another query?"

✅ Expected behavior description
```

## Output Format

The `output.md` file includes:

- Timestamp and execution mode (sequential/parallel)
- Success/failure counts and total duration
- Results grouped by category
- Each query with its response and duration

## Configuration

- **API URL:** Set `API_URL` env var (default: `http://localhost:4000/api/chat`)
- **Parallel limit:** Edit `MAX_CONCURRENT` in `run-tests.ts` (default: 3)

## Troubleshooting

**"Connection refused"**

- Make sure the backend is running on port 4000
- Check your `API_URL` environment variable

**"No queries found"**

- Ensure queries are wrapped in quotes: `"Like this?"`
- Category headers should start with a number: `1. Category Name`

**Slow parallel execution**

- The script batches requests to avoid overwhelming the server
- Adjust `MAX_CONCURRENT` if needed
