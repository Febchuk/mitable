import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { reset } from "drizzle-seed";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";
import crypto from "crypto";

dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool, { schema });

// Supabase client for creating auth users
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Standard password for all test accounts
const TEST_PASSWORD = "Password123!";

// ============================================
// Seed Functions
// ============================================

async function seedOrganization() {
  console.log("📦 Seeding organization...");

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Lorikeet",
      domain: "lorikeet.ai",
      settings: {
        features: {
          aiAgents: true,
          multiChannel: true,
          analytics: true,
        },
        theme: "dark",
      },
    })
    .returning();

  console.log(`✅ Created organization: ${organization.name}`);
  return organization;
}

async function seedUsers(organizationId: string) {
  console.log("👥 Seeding users...");

  // Define user data
  const userData = [
    // Admin Users
    {
      email: "sarah@lorikeet.ai",
      firstName: "Sarah",
      lastName: "Chen",
      role: "admin",
      avatarUrl: "https://i.pravatar.cc/150?img=1",
      currentWeek: null,
      startDate: null,
      status: "active",
    },
    {
      email: "marcus@lorikeet.ai",
      firstName: "Marcus",
      lastName: "Johnson",
      role: "admin",
      avatarUrl: "https://i.pravatar.cc/150?img=12",
      currentWeek: null,
      startDate: null,
      status: "active",
    },
    {
      email: "david@lorikeet.ai",
      firstName: "David",
      lastName: "Kim",
      role: "admin",
      avatarUrl: "https://i.pravatar.cc/150?img=13",
      currentWeek: null,
      startDate: null,
      status: "active",
    },
    // AI/ML Engineers
    {
      email: "emily@lorikeet.ai",
      firstName: "Emily",
      lastName: "Rodriguez",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=5",
      currentWeek: 3,
      startDate: "2024-09-15",
      status: "active",
    },
    {
      email: "alex@lorikeet.ai",
      firstName: "Alex",
      lastName: "Thompson",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=14",
      currentWeek: 1,
      startDate: "2024-10-01",
      status: "active",
    },
    {
      email: "jordan@lorikeet.ai",
      firstName: "Jordan",
      lastName: "Lee",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=25",
      currentWeek: 5,
      startDate: "2024-08-01",
      status: "active",
    },
    // Backend Engineers
    {
      email: "priya@lorikeet.ai",
      firstName: "Priya",
      lastName: "Patel",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=30",
      currentWeek: 2,
      startDate: "2024-09-22",
      status: "active",
    },
    {
      email: "carlos@lorikeet.ai",
      firstName: "Carlos",
      lastName: "Martinez",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=33",
      currentWeek: 4,
      startDate: "2024-08-15",
      status: "active",
    },
    // Frontend Engineers
    {
      email: "jessica@lorikeet.ai",
      firstName: "Jessica",
      lastName: "Wu",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=9",
      currentWeek: 3,
      startDate: "2024-09-10",
      status: "active",
    },
    {
      email: "miguel@lorikeet.ai",
      firstName: "Miguel",
      lastName: "Santos",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=15",
      currentWeek: 1,
      startDate: "2024-10-05",
      status: "active",
    },
    // Product Managers
    {
      email: "rachel@lorikeet.ai",
      firstName: "Rachel",
      lastName: "Green",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=24",
      currentWeek: 2,
      startDate: "2024-09-20",
      status: "active",
    },
    {
      email: "james@lorikeet.ai",
      firstName: "James",
      lastName: "Wilson",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=17",
      currentWeek: 4,
      startDate: "2024-08-20",
      status: "active",
    },
    // Customer Success
    {
      email: "sophie@lorikeet.ai",
      firstName: "Sophie",
      lastName: "Anderson",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=23",
      currentWeek: 2,
      startDate: "2024-09-25",
      status: "active",
    },
    {
      email: "daniel@lorikeet.ai",
      firstName: "Daniel",
      lastName: "Brown",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=18",
      currentWeek: 3,
      startDate: "2024-09-05",
      status: "active",
    },
    // Sales
    {
      email: "olivia@lorikeet.ai",
      firstName: "Olivia",
      lastName: "Davis",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=10",
      currentWeek: 1,
      startDate: "2024-10-08",
      status: "active",
    },
    // Design
    {
      email: "ethan@lorikeet.ai",
      firstName: "Ethan",
      lastName: "Miller",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=16",
      currentWeek: 2,
      startDate: "2024-09-18",
      status: "active",
    },
    // DevOps
    {
      email: "maya@lorikeet.ai",
      firstName: "Maya",
      lastName: "Johnson",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=20",
      currentWeek: 3,
      startDate: "2024-09-12",
      status: "active",
    },
  ];

  // Create Supabase Auth users (database profiles will be created by trigger)
  const users = [];

  for (const user of userData) {
    console.log(`Creating auth user for ${user.email}...`);

    // Create user in Supabase Auth
    // The database trigger will automatically create the user profile
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true, // Auto-confirm email for test accounts
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
        organization_id: organizationId,
      },
    });

    if (authError) {
      console.error(`Failed to create auth user for ${user.email}:`, authError);
      continue;
    }

    if (!authData.user) {
      console.error(`No user data returned for ${user.email}`);
      continue;
    }

    // Wait a moment for the trigger to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Query the created user profile (created by trigger)
    const [dbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authData.user.id))
      .limit(1);

    if (dbUser) {
      // Update additional fields that the trigger doesn't set
      const [updatedUser] = await db
        .update(schema.users)
        .set({
          role: user.role as "admin" | "employee",
          avatarUrl: user.avatarUrl,
          currentWeek: user.currentWeek,
          startDate: user.startDate,
        })
        .where(eq(schema.users.id, authData.user.id))
        .returning();

      users.push(updatedUser);
    } else {
      console.error(`User profile not found for ${user.email} after trigger`);
    }
  }

  console.log(`✅ Created ${users.length} users with Supabase Auth accounts`);
  console.log(`🔑 All accounts use password: ${TEST_PASSWORD}`);
  return users;
}

// seedTemplates removed — roadmap templates are onboarding-era dead code

async function seedConversations(users: schema.User[]) {
  console.log("💬 Seeding conversations...");

  const conversations = [];
  const messages = [];

  // Emily's conversations (AI/ML Engineer, Week 3)
  const emily = users.find((u) => u.email === "emily@lorikeet.ai");
  if (emily) {
    // Conversation 1: LangChain debugging
    const conv1Id = crypto.randomUUID();
    conversations.push({
      id: conv1Id,
      userId: emily.id,
      title: "LangChain chain execution debugging",
      contextType: "help_request",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: conv1Id,
        role: "user",
        content:
          "My LangChain agent is throwing an error when I try to execute a chain with memory. The error says 'Memory not properly initialized'. How do I fix this?",
        messageType: "text",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: conv1Id,
        role: "assistant",
        content:
          "This error typically occurs when the memory object isn't passed correctly to the chain. Here's how to fix it:\n\n1. Initialize memory before creating the chain:\n```python\nfrom langchain.memory import ConversationBufferMemory\nmemory = ConversationBufferMemory()\n```\n\n2. Pass memory to the chain:\n```python\nchain = ConversationChain(\n    llm=llm,\n    memory=memory,\n    verbose=True\n)\n```\n\n3. Make sure you're using the same memory instance across calls.\n\nCheck our Agent Context Management docs for more details on memory patterns.",
        messageType: "text",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 1000),
      }
    );

    // Conversation 2: RAG optimization
    const conv2Id = crypto.randomUUID();
    conversations.push({
      id: conv2Id,
      userId: emily.id,
      title: "RAG retrieval optimization",
      contextType: "general",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: conv2Id,
        role: "user",
        content:
          "What's the best way to optimize our RAG retrieval? I'm seeing slow response times.",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
      {
        conversationId: conv2Id,
        role: "assistant",
        content:
          "Great question! Here are the key optimization strategies:\n\n**1. Chunk Size Optimization**\n- Experiment with chunk sizes (512, 1024, 2048 tokens)\n- Smaller chunks = better precision, larger = more context\n\n**2. Embedding Quality**\n- Use our text-embedding-3-large model (1536 dimensions)\n- Consider metadata filtering to reduce search space\n\n**3. Retrieval Strategy**\n- Use hybrid search (semantic + keyword)\n- Implement re-ranking for better results\n- Cache frequent queries\n\n**4. Index Optimization**\n- Use Pinecone's pod-based indexing\n- Set appropriate similarity metric (cosine for our use case)\n\nCheck the RAG Pipeline Architecture doc for implementation details.",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000 + 3 * 60 * 1000),
      }
    );
  }

  // Alex's conversations (AI/ML Engineer, Week 1)
  const alex = users.find((u) => u.email === "alex@lorikeet.ai");
  if (alex) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: alex.id,
      title: "Setting up local development environment",
      contextType: "help_request",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "I'm having trouble getting the development environment running. Docker containers keep failing. What am I doing wrong?",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Let's troubleshoot your Docker setup:\n\n1. **Check Docker is running**: `docker ps`\n2. **Verify Docker Compose version**: We need v2.x+\n3. **Clear old containers**: `docker-compose down -v`\n4. **Rebuild**: `docker-compose up --build`\n\n**Common issues:**\n- Port conflicts (3000, 5432 already in use)\n- Insufficient memory allocated to Docker\n- Missing .env file\n\nCheck the Codebase Setup Guide for the complete setup checklist. If still stuck, share the error logs!",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "user",
        content: "Thanks! It was a port conflict. All working now!",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      }
    );
  }

  // Priya's conversations (Backend Engineer, Week 2)
  const priya = users.find((u) => u.email === "priya@lorikeet.ai");
  if (priya) {
    // Conversation 1: API design
    const conv1Id = crypto.randomUUID();
    conversations.push({
      id: conv1Id,
      userId: priya.id,
      title: "REST API design best practices",
      contextType: "general",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: conv1Id,
        role: "user",
        content:
          "I'm designing my first API endpoint. What are the key REST API principles I should follow?",
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: conv1Id,
        role: "assistant",
        content:
          "Here are our API design principles:\n\n**1. Resource Naming**\n- Use nouns, not verbs: `/users` not `/getUsers`\n- Plural for collections: `/conversations`\n- Use kebab-case: `/user-profiles`\n\n**2. HTTP Methods**\n- GET: Read resources\n- POST: Create resources\n- PUT/PATCH: Update resources\n- DELETE: Remove resources\n\n**3. Response Structure**\n- Consistent error format\n- Include pagination metadata\n- Use appropriate status codes (200, 201, 400, 404, 500)\n\n**4. Versioning**\n- Use `/api/v1/` prefix\n- Never break backwards compatibility\n\n**5. Security**\n- Always require authentication\n- Validate and sanitize input\n- Rate limiting\n\nCheck the API Reference Documentation for examples!",
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000),
      }
    );

    // Conversation 2: Database queries
    const conv2Id = crypto.randomUUID();
    conversations.push({
      id: conv2Id,
      userId: priya.id,
      title: "PostgreSQL query optimization",
      contextType: "help_request",
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
      updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: conv2Id,
        role: "user",
        content: "My query is taking 5 seconds to return results. How do I make it faster?",
        messageType: "text",
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
      {
        conversationId: conv2Id,
        role: "assistant",
        content:
          "Let's optimize that query! Here's the process:\n\n**1. Use EXPLAIN ANALYZE**\n```sql\nEXPLAIN ANALYZE\nSELECT * FROM conversations WHERE user_id = '...';\n```\nThis shows you the query plan and execution time.\n\n**2. Add Indexes**\n- Index foreign keys: `CREATE INDEX idx_conversations_user_id ON conversations(user_id);`\n- Index commonly queried columns\n- Composite indexes for multi-column queries\n\n**3. Optimize Query Structure**\n- Use `SELECT` specific columns, not `SELECT *`\n- Add `LIMIT` for pagination\n- Use JOINs efficiently\n\n**4. Check for N+1 Queries**\n- Use Drizzle's `.with()` for eager loading\n\nShare your query and EXPLAIN output for specific advice!",
        messageType: "text",
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000 + 4 * 60 * 1000),
      }
    );
  }

  // Miguel's conversations (Frontend Engineer, Week 1)
  const miguel = users.find((u) => u.email === "miguel@lorikeet.ai");
  if (miguel) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: miguel.id,
      title: "React component patterns",
      contextType: "general",
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "What React patterns do we use for state management? I see Context API in some places and props drilling in others.",
        messageType: "text",
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Great observation! Here's our state management strategy:\n\n**1. Local State** (useState)\n- UI state (dropdowns, modals)\n- Form inputs\n- Component-specific data\n\n**2. Context API** (useContext)\n- Authentication state\n- Theme/settings\n- Data shared across multiple components\n- We have: AuthContext, RoadmapContext, NudgesContext\n\n**3. Server State** (React Query)\n- API data fetching\n- Caching and revalidation\n- (We're migrating to this pattern)\n\n**When to use what:**\n- Single component → useState\n- Multiple related components → lift state up or Context\n- Cross-cutting concerns → Context\n- API data → Context with fetch logic\n\n**Anti-patterns to avoid:**\n- Don't put everything in Context\n- Don't prop drill more than 2-3 levels\n- Avoid derived state when possible",
        messageType: "text",
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000 + 6 * 60 * 1000),
      }
    );
  }

  // Rachel's conversations (Product Manager, Week 2)
  const rachel = users.find((u) => u.email === "rachel@lorikeet.ai");
  if (rachel) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: rachel.id,
      title: "Understanding AI capabilities for PRD",
      contextType: "general",
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
      updatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "I'm writing a PRD for an AI feature that summarizes customer conversations. What's technically feasible with our current LLM setup?",
        messageType: "text",
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Great feature idea! Here's what we can do:\n\n**Current Capabilities:**\n- Multi-turn conversation summarization ✅\n- Key points extraction ✅\n- Sentiment analysis ✅\n- Action items detection ✅\n- Custom summary formats ✅\n\n**Technical Constraints:**\n- Context window: 128k tokens (GPT-4) or 200k (Claude)\n- Response time: 2-5 seconds typical\n- Cost: ~$0.01-0.03 per summary\n\n**Implementation Approach:**\n1. Use our existing LLM pipeline\n2. Create custom prompt template for summaries\n3. Add streaming for real-time updates\n4. Cache summaries to avoid re-generation\n\n**Considerations for PRD:**\n- Define summary length (brief/detailed/comprehensive)\n- Specify trigger points (end of conversation, manual, scheduled)\n- Handle multi-language conversations?\n- Privacy: what data can be summarized?\n\nHappy to review your PRD draft!",
        messageType: "text",
        createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000 + 8 * 60 * 1000),
      }
    );
  }

  // Sophie's conversations (Customer Success, Week 2)
  const sophie = users.find((u) => u.email === "sophie@lorikeet.ai");
  if (sophie) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: sophie.id,
      title: "Explaining agent context to customers",
      contextType: "help_request",
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "Customer asked how our agents remember conversation history. How do I explain this in non-technical terms?",
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Here's a customer-friendly explanation:\n\n**Simple Analogy:**\n\"Think of our AI agents like having a conversation with a colleague who takes detailed notes. They remember:\n- What you talked about previously\n- Important context from your account\n- Your preferences and past interactions\n\nThis 'memory' helps them give relevant, personalized responses without you having to repeat information.\"\n\n**Technical Details (if they ask):**\n- We store conversation history for 30 days\n- Agents can access the last 50 messages in a conversation\n- We use embeddings to find relevant past conversations\n- Context is refreshed at the start of each interaction\n\n**Privacy Reassurance:**\n- All data is encrypted\n- Only authorized agents access conversation history\n- Customers can request deletion anytime\n- No data shared across organizations\n\n**Key Benefits to Emphasize:**\n- No need to repeat information\n- Faster resolution times\n- Consistent experience across sessions\n- Agents provide context-aware suggestions\n\nUse the Agent Context Management doc as a reference!",
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 5 * 60 * 1000),
      }
    );
  }

  // Daniel's conversations (Customer Success, Week 3)
  const daniel = users.find((u) => u.email === "daniel@lorikeet.ai");
  if (daniel) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: daniel.id,
      title: "API rate limiting troubleshooting",
      contextType: "help_request",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "Enterprise customer is hitting rate limits. What are our limits and how can they optimize?",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Here's the rate limit information:\n\n**Current Limits (Enterprise tier):**\n- API requests: 10,000/hour, 100,000/day\n- Concurrent connections: 100\n- Message rate: 500/minute per agent\n- Burst allowance: 2x limit for 1 minute\n\n**Optimization Strategies:**\n\n1. **Batch Requests**\n   - Group multiple operations into single API calls\n   - Use bulk endpoints when available\n\n2. **Caching**\n   - Cache responses for frequently accessed data\n   - Use ETags for conditional requests\n\n3. **Webhook Instead of Polling**\n   - Subscribe to webhooks for real-time updates\n   - Reduces unnecessary API calls\n\n4. **Retry Strategy**\n   - Implement exponential backoff\n   - Respect Retry-After headers\n\n5. **Request Optimization**\n   - Only request needed fields\n   - Use pagination efficiently\n\n**Response Headers:**\n- `X-RateLimit-Limit`: Total allowed\n- `X-RateLimit-Remaining`: Remaining in window\n- `X-RateLimit-Reset`: Unix timestamp of reset\n\n**If They Need More:**\n- We can upgrade to Custom tier (higher limits)\n- Contact sales for custom quotas\n\nShould I escalate this to engineering for a custom quota?",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      }
    );
  }

  // Olivia's conversations (Sales, Week 1)
  const olivia = users.find((u) => u.email === "olivia@lorikeet.ai");
  if (olivia) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: olivia.id,
      title: "Security and data privacy for enterprise prospects",
      contextType: "general",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "Prospect is concerned about data privacy and security in our LLM system. What can I tell them?",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Here are our key security and privacy features:\n\n**Data Encryption:**\n- End-to-end encryption in transit (TLS 1.3)\n- Encryption at rest (AES-256)\n- Encrypted backups\n\n**Data Privacy:**\n- No training on customer data - we use only pre-trained models\n- Data isolation - each customer's data in separate namespace\n- Zero data retention on LLM provider side\n- GDPR and SOC 2 Type II compliant\n\n**Access Controls:**\n- Role-based access control (RBAC)\n- Multi-factor authentication (MFA)\n- SSO with SAML 2.0\n- Detailed audit logs\n\n**Infrastructure Security:**\n- Private VPC deployment available\n- DDoS protection\n- Regular penetration testing\n- Bug bounty program\n\n**LLM-Specific Security:**\n- Prompt injection protection\n- PII detection and masking\n- Content filtering\n- Rate limiting and abuse prevention\n\n**Compliance:**\n- SOC 2 Type II certified\n- GDPR compliant\n- HIPAA available (Enterprise+)\n- Data residency options (US, EU, APAC)\n\n**Key Differentiators:**\n- Self-hosted option for maximum control\n- Bring-your-own-key (BYOK) encryption\n- Real-time security monitoring\n\nWe also have a detailed security whitepaper I can send them!",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000 + 10 * 60 * 1000),
      }
    );
  }

  // Ethan's conversations (Design, Week 2)
  const ethan = users.find((u) => u.email === "ethan@lorikeet.ai");
  if (ethan) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: ethan.id,
      title: "Design system components for chat UI",
      contextType: "general",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // updated 3 days ago
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "I'm designing a new chat interface. What components should I use from our design system?",
        messageType: "text",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Great question! Here are the key components for chat interfaces:\n\n**Core Components:**\n\n1. **Message Bubble** (`MessageBubble.tsx`)\n   - User vs Assistant variants\n   - Timestamp display\n   - Status indicators (sending, sent, error)\n\n2. **Message Input** (`MessageInput.tsx`)\n   - Auto-resizing textarea\n   - Send button\n   - File attachment support\n   - Emoji picker integration\n\n3. **Conversation List** (`ConversationList.tsx`)\n   - Virtualized for performance\n   - Unread indicators\n   - Search/filter built-in\n\n4. **Typing Indicator** (`TypingIndicator.tsx`)\n   - Animated dots\n   - Shows when assistant is generating\n\n5. **Message Actions** (`MessageActions.tsx`)\n   - Copy, edit, delete\n   - Thumbs up/down feedback\n\n**Layout Components:**\n- `ChatContainer`: Main chat layout\n- `ChatHeader`: Conversation title, actions\n- `MessageList`: Scrollable message area\n- `ChatFooter`: Input area\n\n**Patterns to Follow:**\n- Use our spacing scale (8px grid)\n- Follow color tokens (bg-primary, text-secondary)\n- Implement accessibility (ARIA labels, keyboard nav)\n- Add smooth animations (message fade-in, scroll)\n\n**Figma Resources:**\n- Chat UI Kit in our component library\n- See Dashboard → Messages tab for examples\n\nCheck the Lorikeet Design System docs for implementation details!",
        messageType: "text",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "user",
        content: "Perfect! Should I use the existing MessageBubble or create a new variant?",
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          'Use the existing `MessageBubble` component - it\'s already flexible!\n\n**Current Variants:**\n- `variant="user"` - Right-aligned, blue background\n- `variant="assistant"` - Left-aligned, gray background\n- `variant="system"` - Centered, lighter styling\n\n**Customization Props:**\n```tsx\n<MessageBubble\n  variant="assistant"\n  showAvatar={true}\n  showTimestamp={true}\n  status="sent" // sending | sent | error\n  onAction={(action) => {}} // copy, edit, delete\n>\n  {content}\n</MessageBubble>\n```\n\n**When to Create New Variant:**\n- Only if you need fundamentally different styling\n- Document it in Storybook\n- Get design review first\n\nFor your use case, the existing component should work perfectly with props customization!',
        messageType: "text",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      }
    );
  }

  // Maya's conversations (DevOps, Week 3)
  const maya = users.find((u) => u.email === "maya@lorikeet.ai");
  if (maya) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: maya.id,
      title: "Monitoring and alerting best practices",
      contextType: "general",
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content: "I'm setting up monitoring for a new service. What metrics should I track?",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Here's our standard monitoring setup:\n\n**RED Metrics (Must Have):**\n- **Rate**: Requests per second\n- **Errors**: Error rate (4xx, 5xx)\n- **Duration**: Response time (p50, p95, p99)\n\n**System Metrics:**\n- CPU usage\n- Memory usage\n- Disk I/O\n- Network throughput\n\n**Application Metrics:**\n- Database query performance\n- Cache hit rate\n- Queue depth\n- Active connections\n\n**Business Metrics:**\n- API calls by endpoint\n- Feature usage\n- User activity\n\n**Alert Thresholds:**\n\n**Critical (PagerDuty):**\n- Error rate > 5%\n- P95 latency > 2s\n- CPU > 80% for 5 min\n- Memory > 90%\n\n**Warning (Slack):**\n- Error rate > 1%\n- P95 latency > 1s\n- CPU > 60% for 10 min\n\n**DataDog Setup:**\n```yaml\n# datadog.yaml\nmetrics:\n  - service.request.rate\n  - service.request.duration\n  - service.error.rate\n  - system.cpu.usage\n  - system.memory.usage\n```\n\n**Dashboard Sections:**\n1. Overview (traffic, errors, latency)\n2. System Resources\n3. Database Performance\n4. External Dependencies\n5. Custom Business Metrics\n\nCheck the Monitoring & Observability doc for DataDog dashboard templates!",
        messageType: "text",
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000 + 7 * 60 * 1000),
      }
    );
  }

  // Carlos's conversations (Backend Engineer, Week 4)
  const carlosUser = users.find((u) => u.email === "carlos@lorikeet.ai");
  if (carlosUser) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: carlosUser.id,
      title: "Message queue architecture decisions",
      contextType: "general",
      createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000), // 18 hours ago
      updatedAt: new Date(Date.now() - 14 * 60 * 60 * 1000), // updated 14 hours ago
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "I'm designing a distributed task queue. What are the tradeoffs between RabbitMQ, Redis, and SQS?",
        messageType: "text",
        createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Great question! Here's a comparison:\n\n**RabbitMQ**\n✅ Pros:\n- Advanced routing (exchanges, bindings)\n- High reliability (persistent queues)\n- Strong ordering guarantees\n- Dead letter queues\n- Management UI\n\n❌ Cons:\n- Higher operational overhead\n- More complex setup\n- Need to manage clustering\n\n**Redis (with Bull/BullMQ)**\n✅ Pros:\n- Extremely fast\n- Simple to set up\n- Good Node.js libraries\n- Built-in retry logic\n- Job prioritization\n\n❌ Cons:\n- Persistence is optional (risk of data loss)\n- Not designed for queues (but works well)\n- Limited scalability vs dedicated queue\n\n**AWS SQS**\n✅ Pros:\n- Fully managed (no ops)\n- Infinite scalability\n- Pay per use\n- Integrated with AWS ecosystem\n\n❌ Cons:\n- No ordering in standard queues\n- FIFO has throughput limits\n- Vendor lock-in\n- Higher latency vs self-hosted\n\n**My Recommendation:**\n\nFor your use case, I'd suggest:\n\n1. **Start with Redis + BullMQ** if:\n   - You already use Redis\n   - Need fast job processing\n   - Can tolerate potential data loss\n   - Want simple setup\n\n2. **Use RabbitMQ** if:\n   - Need complex routing\n   - Require strict guarantees\n   - Have ops team to manage it\n\n3. **Use SQS** if:\n   - Running on AWS\n   - Want zero operations\n   - Can handle higher latency\n\n**Our Stack:**\nWe use Redis + BullMQ for most background jobs (email, analytics) and SQS for critical workflows (billing, data pipeline).\n\nWant to discuss your specific requirements?",
        messageType: "text",
        createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000 + 20 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "user",
        content:
          "This is for processing AI agent tasks - need reliability and can handle some latency. Sounds like SQS might be best?",
        messageType: "text",
        createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Yes, SQS is perfect for that use case! Here's why:\n\n**For AI Agent Tasks:**\n\n✅ **Reliability** - SQS guarantees at-least-once delivery\n✅ **Scalability** - Handle thousands of concurrent agent tasks\n✅ **Latency tolerance** - AI processing takes seconds anyway\n✅ **Cost-effective** - Pay only for what you use\n✅ **Dead letter queues** - Handle failed agent tasks gracefully\n\n**Implementation Tips:**\n\n1. **Use FIFO Queue** if order matters:\n```typescript\nconst params = {\n  QueueUrl: process.env.AGENT_QUEUE_URL,\n  MessageBody: JSON.stringify(agentTask),\n  MessageGroupId: task.userId, // Group by user\n  MessageDeduplicationId: task.id // Prevent duplicates\n};\n```\n\n2. **Set appropriate visibility timeout**:\n- AI tasks take 30-120s\n- Set timeout to 5 minutes\n- Implement heartbeat for long tasks\n\n3. **Add retry logic**:\n```typescript\nMaximumReceives: 3 // Retry 3 times\ndeadLetterTargetArn: dlqArn // Then send to DLQ\n```\n\n4. **Monitor with CloudWatch**:\n- ApproximateNumberOfMessages\n- ApproximateAgeOfOldestMessage\n- NumberOfMessagesSent/Received\n\n**Sample Architecture:**\n```\nAPI → SQS FIFO Queue → Lambda/ECS Workers → AI Service\n                 ↓\n          DLQ (Failed tasks)\n```\n\nWant help setting up the infrastructure code?",
        messageType: "text",
        createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000 + 15 * 60 * 1000),
      }
    );
  }

  // James's conversations (Product Manager, Week 4)
  const james = users.find((u) => u.email === "james@lorikeet.ai");
  if (james) {
    const convId = crypto.randomUUID();
    conversations.push({
      id: convId,
      userId: james.id,
      title: "RAG system improvements",
      contextType: "general",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // updated 4 days ago
    });
    messages.push(
      {
        conversationId: convId,
        role: "user",
        content:
          "We're prioritizing RAG improvements. What would have the biggest impact on retrieval quality?",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Based on user feedback and metrics, here are the highest-impact improvements:\n\n**1. Hybrid Search (High Impact, Medium Effort)**\nCombine semantic + keyword search:\n- Semantic: Great for conceptual matches\n- Keyword: Essential for exact terms, codes, names\n- Hybrid: Best of both worlds\n\nExpected: +25% retrieval accuracy\nEffort: 2-3 weeks\n\n**2. Re-ranking (Very High Impact, Low Effort)**\nAdd cross-encoder re-ranking:\n- Take top 20 semantic results\n- Re-rank with more powerful model\n- Return top 5\n\nExpected: +30% relevance\nEffort: 1 week\n\n**3. Query Enhancement (Medium Impact, Low Effort)**\nImprove queries before retrieval:\n- Expand acronyms\n- Add context from conversation\n- Generate multiple query variants\n\nExpected: +15% recall\nEffort: 1 week\n\n**4. Chunk Optimization (Medium Impact, Medium Effort)**\nSmarter chunking strategy:\n- Semantic chunking (split at topic boundaries)\n- Overlapping chunks\n- Maintain context headers\n\nExpected: +20% context quality\nEffort: 2 weeks\n\n**5. Metadata Filtering (High Impact, Low Effort)**\nAdd rich metadata:\n- Document type, recency, source\n- User role, team, permissions\n- Pre-filter before semantic search\n\nExpected: +35% precision\nEffort: 1-2 weeks\n\n**Recommended Prioritization:**\n1. Metadata Filtering (quick win)\n2. Re-ranking (biggest impact per effort)\n3. Hybrid Search (foundational improvement)\n4. Query Enhancement\n5. Chunk Optimization\n\n**Combined Impact:**\nImplementing top 3 could improve overall RAG quality by 60-80%!\n\nWant me to draft a technical spec for these improvements?",
        messageType: "text",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "user",
        content:
          "This is super helpful! Let's prioritize re-ranking and metadata filtering for next sprint. Can you work with Emily and Jordan on the implementation?",
        messageType: "text",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        conversationId: convId,
        role: "assistant",
        content:
          "Perfect choice - those two will give us the best ROI!\n\n**Next Steps:**\n\n1. **Technical Spec** (This week)\n   - I'll draft detailed spec for both improvements\n   - Include API changes, data requirements, metrics\n   - Share for review by EOW\n\n2. **Team Sync** (Next Monday)\n   - Meeting with Emily (implementation) and Jordan (RAG expertise)\n   - Discuss approach and timeline\n   - Identify any blockers\n\n3. **Sprint Planning** (Next Wednesday)\n   - Break down into tickets\n   - Estimate effort\n   - Set success metrics\n\n**Success Metrics:**\n- Retrieval accuracy: Baseline 65% → Target 85%\n- User satisfaction: Track thumbs up/down\n- Response quality: GPT-4 as a judge\n- Latency: Keep under 500ms\n\n**Risks:**\n- Re-ranking adds ~200ms latency (acceptable)\n- Metadata schema changes (need migration)\n- May need Pinecone namespace updates\n\nI'll loop in Emily and Jordan today and get the spec started!",
        messageType: "text",
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
      }
    );
  }

  // Insert conversations and messages
  if (conversations.length > 0) {
    await db.insert(schema.conversations).values(conversations);
  }
  if (messages.length > 0) {
    await db.insert(schema.messages).values(messages);
  }

  console.log(`✅ Created ${conversations.length} conversations with ${messages.length} messages`);
  return { conversations, messages };
}

async function seedBenchmarks(organizationId: string, users: schema.User[]) {
  console.log("🎯 Seeding benchmarks...");

  // ── Benchmark definitions ──────────────────────────────────────────────

  const BENCHMARKS = [
    {
      id: "bm-deep-focus",
      name: "Deep Focus Work",
      description: "Measures sustained periods of concentrated work without interruptions",
      category: "productivity",
      metric: "minutes",
      targetValue: 120,
      unit: "min/day",
      frequency: "weekly",
    },
    {
      id: "bm-meeting-efficiency",
      name: "Meeting Efficiency",
      description: "Evaluates the ratio of productive meeting time to total meeting time",
      category: "productivity",
      metric: "percentage",
      targetValue: 80,
      unit: "%",
      frequency: "weekly",
    },
    {
      id: "bm-consistent-engagement",
      name: "Consistent Engagement",
      description: "Tracks regular work activity across the week",
      category: "productivity",
      metric: "count",
      targetValue: 5,
      unit: "days/week",
      frequency: "weekly",
    },
    {
      id: "bm-clear-communication",
      name: "Clear Communication",
      description: "Measures time spent on clear, structured communication with team members",
      category: "collaboration",
      metric: "minutes",
      targetValue: 60,
      unit: "min/week",
      frequency: "weekly",
    },
    {
      id: "bm-cross-functional",
      name: "Cross-functional Collaboration",
      description: "Tracks percentage of work involving cross-team collaboration",
      category: "collaboration",
      metric: "percentage",
      targetValue: 30,
      unit: "%",
      frequency: "weekly",
    },
    {
      id: "bm-ai-adoption",
      name: "AI Adoption & Tool Usage",
      description: "Measures adoption and effective use of AI tools in daily workflow",
      category: "growth",
      metric: "score",
      targetValue: 5,
      unit: "score 1-5",
      frequency: "weekly",
    },
    {
      id: "bm-mentorship",
      name: "Mentorship & Development",
      description: "Time invested in mentoring and developing team members",
      category: "growth",
      metric: "minutes",
      targetValue: 45,
      unit: "min/week",
      frequency: "weekly",
    },
    {
      id: "bm-proactive",
      name: "Proactive vs Reactive Work",
      description: "Ratio of self-initiated work to reactive/requested work",
      category: "quality",
      metric: "score",
      targetValue: 4,
      unit: "score 1-5",
      frequency: "weekly",
    },
    {
      id: "bm-work-life",
      name: "Work-Life Balance",
      description: "Maintains healthy work hours without excessive overtime",
      category: "quality",
      metric: "hours",
      targetValue: 8,
      unit: "hrs/day",
      frequency: "weekly",
    },
  ];

  // ── Parameters per benchmark ───────────────────────────────────────────

  const BENCHMARK_PARAMETERS: Record<
    string,
    { name: string; description: string; importance: number }[]
  > = {
    "bm-deep-focus": [
      {
        name: "Session Length",
        description: "Average duration of uninterrupted focus sessions",
        importance: 5,
      },
      {
        name: "Distraction Resistance",
        description: "Ability to maintain focus without app-switching",
        importance: 4,
      },
      {
        name: "Flow State Entry",
        description: "Speed of reaching deep focus after starting work",
        importance: 3,
      },
    ],
    "bm-meeting-efficiency": [
      {
        name: "On-Agenda Rate",
        description: "Percentage of meeting time spent on planned agenda items",
        importance: 5,
      },
      {
        name: "Meeting Preparation",
        description: "Frequency of arriving prepared with notes or pre-reads",
        importance: 4,
      },
      {
        name: "Action Item Completion",
        description: "Rate of completing follow-up tasks from meetings",
        importance: 4,
      },
      {
        name: "Meeting Duration Adherence",
        description: "How often meetings end on time or early",
        importance: 3,
      },
    ],
    "bm-consistent-engagement": [
      {
        name: "Active Days Per Week",
        description: "Number of days with meaningful tracked activity",
        importance: 5,
      },
      {
        name: "Session Start Consistency",
        description: "Regularity of starting work at consistent times",
        importance: 3,
      },
      {
        name: "Weekend Boundary",
        description: "Avoidance of working outside contracted hours",
        importance: 2,
      },
    ],
    "bm-clear-communication": [
      {
        name: "Message Clarity",
        description: "Feedback score on written communication quality",
        importance: 5,
      },
      {
        name: "Response Timeliness",
        description: "Speed of responding to team messages and threads",
        importance: 4,
      },
      {
        name: "Documentation Contributions",
        description: "Frequency of writing and updating shared documentation",
        importance: 3,
      },
    ],
    "bm-cross-functional": [
      {
        name: "Cross-Team Interactions",
        description: "Number of collaborative sessions with people outside primary team",
        importance: 5,
      },
      {
        name: "Shared Project Involvement",
        description: "Percentage of work tied to multi-team initiatives",
        importance: 4,
      },
      {
        name: "Knowledge Sharing",
        description: "Frequency of sharing learnings across team boundaries",
        importance: 3,
      },
    ],
    "bm-ai-adoption": [
      {
        name: "Tool Usage Frequency",
        description: "How often AI tools are used in daily workflow",
        importance: 5,
      },
      {
        name: "Prompt Quality",
        description: "Effectiveness of prompts crafted for AI tools",
        importance: 4,
      },
      {
        name: "Workflow Integration",
        description: "Degree to which AI is embedded in standard tasks",
        importance: 4,
      },
      {
        name: "Continuous Learning",
        description: "Exploration of new AI capabilities and features",
        importance: 3,
      },
    ],
    "bm-mentorship": [
      {
        name: "1-on-1 Time",
        description: "Regular one-on-one sessions held with mentees",
        importance: 5,
      },
      {
        name: "Code Review Quality",
        description: "Depth and educational value of code reviews provided",
        importance: 4,
      },
      {
        name: "Pair Programming Sessions",
        description: "Time spent pairing to transfer knowledge",
        importance: 3,
      },
    ],
    "bm-proactive": [
      {
        name: "Self-Initiated Work Ratio",
        description: "Proportion of tasks started without external prompting",
        importance: 5,
      },
      {
        name: "Blocker Resolution Speed",
        description: "How quickly self-identified blockers are resolved proactively",
        importance: 4,
      },
      {
        name: "Planning Ahead",
        description: "Evidence of forward-looking task planning and preparation",
        importance: 3,
      },
    ],
    "bm-work-life": [
      {
        name: "Daily Hours Consistency",
        description: "Variance in daily active hours — lower is healthier",
        importance: 5,
      },
      {
        name: "Off-Hours Activity",
        description: "Absence of work activity outside agreed working hours",
        importance: 4,
      },
      {
        name: "Break Frequency",
        description: "Regular short breaks taken throughout the working day",
        importance: 3,
      },
    ],
  };

  // ── Assignment configs per benchmark (5 users, percentile-distributed) ─

  type AssignmentConfig = {
    userIndex: number;
    currentValue: number;
    progress: number;
    percentile: string;
    trend: string;
    trendDelta: number;
  };

  // currentValue is always 1-5 (AI weighted score), progress = (currentValue/5)*100
  const ASSIGNMENT_CONFIGS: Record<string, AssignmentConfig[]> = {
    "bm-deep-focus": [
      {
        userIndex: 0,
        currentValue: 4.6,
        progress: 92,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 5,
      },
      {
        userIndex: 1,
        currentValue: 4.2,
        progress: 84,
        percentile: "top_10",
        trend: "improving",
        trendDelta: 3,
      },
      {
        userIndex: 2,
        currentValue: 3.7,
        progress: 74,
        percentile: "top_25",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 3,
        currentValue: 3.0,
        progress: 60,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 4,
        currentValue: 2.3,
        progress: 46,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 4,
      },
    ],
    "bm-meeting-efficiency": [
      {
        userIndex: 0,
        currentValue: 4.4,
        progress: 88,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 6,
      },
      {
        userIndex: 1,
        currentValue: 4.0,
        progress: 80,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 2,
        currentValue: 3.5,
        progress: 70,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 4,
      },
      {
        userIndex: 3,
        currentValue: 2.8,
        progress: 56,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
      },
    ],
    "bm-consistent-engagement": [
      {
        userIndex: 0,
        currentValue: 4.8,
        progress: 96,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 1,
        currentValue: 4.5,
        progress: 90,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 2,
        currentValue: 3.8,
        progress: 76,
        percentile: "top_25",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 3,
        currentValue: 3.2,
        progress: 64,
        percentile: "top_50",
        trend: "improving",
        trendDelta: 3,
      },
      {
        userIndex: 4,
        currentValue: 2.5,
        progress: 50,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 2,
      },
    ],
    "bm-clear-communication": [
      {
        userIndex: 0,
        currentValue: 4.3,
        progress: 86,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 7,
      },
      {
        userIndex: 1,
        currentValue: 3.9,
        progress: 78,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 2,
      },
      {
        userIndex: 2,
        currentValue: 3.4,
        progress: 68,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 4,
      },
      {
        userIndex: 3,
        currentValue: 2.6,
        progress: 52,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
      },
    ],
    "bm-cross-functional": [
      {
        userIndex: 0,
        currentValue: 4.5,
        progress: 90,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 5,
      },
      {
        userIndex: 1,
        currentValue: 3.8,
        progress: 76,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 2,
        currentValue: 3.2,
        progress: 64,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 3,
      },
      {
        userIndex: 3,
        currentValue: 2.2,
        progress: 44,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 2,
      },
    ],
    "bm-ai-adoption": [
      {
        userIndex: 0,
        currentValue: 4.8,
        progress: 96,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 4,
      },
      {
        userIndex: 1,
        currentValue: 4.1,
        progress: 82,
        percentile: "top_10",
        trend: "improving",
        trendDelta: 6,
      },
      {
        userIndex: 2,
        currentValue: 3.5,
        progress: 70,
        percentile: "top_25",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 3,
        currentValue: 2.8,
        progress: 56,
        percentile: "top_50",
        trend: "improving",
        trendDelta: 4,
      },
      {
        userIndex: 4,
        currentValue: 2.0,
        progress: 40,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 3,
      },
    ],
    "bm-mentorship": [
      {
        userIndex: 0,
        currentValue: 4.4,
        progress: 88,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 5,
      },
      {
        userIndex: 1,
        currentValue: 3.9,
        progress: 78,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 2,
        currentValue: 3.3,
        progress: 66,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 4,
      },
    ],
    "bm-proactive": [
      {
        userIndex: 0,
        currentValue: 4.5,
        progress: 90,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 6,
      },
      {
        userIndex: 1,
        currentValue: 3.8,
        progress: 76,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 2,
        currentValue: 3.4,
        progress: 68,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 3,
      },
      {
        userIndex: 3,
        currentValue: 2.5,
        progress: 50,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
      },
    ],
    "bm-work-life": [
      {
        userIndex: 0,
        currentValue: 4.7,
        progress: 94,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 1,
        currentValue: 4.3,
        progress: 86,
        percentile: "top_10",
        trend: "stable",
        trendDelta: 1,
      },
      {
        userIndex: 2,
        currentValue: 3.8,
        progress: 76,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 4,
      },
      {
        userIndex: 3,
        currentValue: 3.2,
        progress: 64,
        percentile: "top_25",
        trend: "stable",
        trendDelta: 0,
      },
      {
        userIndex: 4,
        currentValue: 2.6,
        progress: 52,
        percentile: "top_50",
        trend: "improving",
        trendDelta: 3,
      },
    ],
  };

  // ── Suggestions per benchmark category ────────────────────────────────

  const SUGGESTIONS_BY_BENCHMARK: Record<string, { text: string; category: string }[]> = {
    "bm-deep-focus": [
      {
        text: "Try scheduling 2-hour focus blocks in the morning before checking messages",
        category: "scheduling",
      },
      {
        text: "Use the Pomodoro technique with 45-minute intervals for complex tasks",
        category: "habits",
      },
      {
        text: "Your focus sessions have been trending upward — keep it going!",
        category: "encouragement",
      },
    ],
    "bm-meeting-efficiency": [
      {
        text: "Block 10 minutes before each meeting to review the agenda and come prepared",
        category: "scheduling",
      },
      {
        text: "Designate the last 5 minutes of every meeting for action item capture",
        category: "habits",
      },
      {
        text: "Your on-time meeting end rate is improving — great work staying disciplined!",
        category: "encouragement",
      },
    ],
    "bm-consistent-engagement": [
      {
        text: "Set a consistent start-of-day ritual to signal the beginning of your work session",
        category: "habits",
      },
      {
        text: "Protect your core working hours by blocking focus time early each week",
        category: "scheduling",
      },
      {
        text: "You've logged activity every day this week — excellent consistency!",
        category: "encouragement",
      },
    ],
    "bm-clear-communication": [
      {
        text: "Before sending a long message, ask yourself: can this be condensed to 3 bullet points?",
        category: "habits",
      },
      {
        text: "Batch async communication into two daily windows to reduce fragmented replies",
        category: "scheduling",
      },
      {
        text: "Your teammates have noticed the clarity in your recent updates — keep it up!",
        category: "encouragement",
      },
    ],
    "bm-cross-functional": [
      {
        text: "Reach out to one person outside your team each week for a 15-minute knowledge exchange",
        category: "habits",
      },
      {
        text: "Volunteer for at least one cross-team initiative per quarter to broaden your network",
        category: "scheduling",
      },
      {
        text: "Your cross-team collaboration ratio is in the top 25% — you're setting a great example!",
        category: "encouragement",
      },
    ],
    "bm-ai-adoption": [
      {
        text: "Dedicate 30 minutes each Friday to exploring a new AI feature or workflow",
        category: "habits",
      },
      {
        text: "Pair with a colleague who scores highly on this benchmark to discover new tool patterns",
        category: "habits",
      },
      {
        text: "Your AI tool usage has grown week-over-week — you're building a real competitive edge!",
        category: "encouragement",
      },
    ],
    "bm-mentorship": [
      {
        text: "Schedule a recurring weekly 30-minute 1-on-1 with your mentee to maintain momentum",
        category: "scheduling",
      },
      {
        text: "Turn code reviews into teaching moments by explaining the 'why' behind your feedback",
        category: "habits",
      },
      {
        text: "Your investment in developing others is paying off — your mentee's output has improved!",
        category: "encouragement",
      },
    ],
    "bm-proactive": [
      {
        text: "Each Monday, identify the top 3 things you can move forward without being asked",
        category: "habits",
      },
      {
        text: "When you spot a blocker, flag it immediately with a proposed solution rather than waiting",
        category: "habits",
      },
      {
        text: "Your proactive-to-reactive ratio has shifted positively over the past two weeks — great momentum!",
        category: "encouragement",
      },
    ],
    "bm-work-life": [
      {
        text: "Set a hard stop alarm 15 minutes before your desired end time to wrap up gracefully",
        category: "habits",
      },
      {
        text: "Keep your calendar end-of-day boundary visible to your manager so they can respect it",
        category: "scheduling",
      },
      {
        text: "Your hours have been consistently healthy this week — well done protecting your energy!",
        category: "encouragement",
      },
    ],
  };

  // ── Accomplishments per benchmark ──────────────────────────────────────

  const ACCOMPLISHMENTS_BY_BENCHMARK: Record<string, string[]> = {
    "bm-deep-focus": [
      "3 deep focus sessions over 90 minutes this week",
      "Maintained 85% on-task rate during focus blocks",
      "Completed sprint tasks ahead of schedule",
      "Longest uninterrupted session: 2h 20m on Thursday",
    ],
    "bm-meeting-efficiency": [
      "All meetings ended on time or early this week",
      "Prepared written agenda for every meeting attended",
      "Completed 100% of action items from last week's meetings",
      "Reduced average meeting duration by 10 minutes through tighter facilitation",
    ],
    "bm-consistent-engagement": [
      "Active on all 5 working days this week",
      "Started work within the same 30-minute window every day",
      "Zero weekend activity — healthy boundary maintained",
      "Consistent 7+ hour active days without overtime",
    ],
    "bm-clear-communication": [
      "Received positive feedback on sprint update clarity",
      "All async messages answered within 2 hours during working hours",
      "Updated team wiki with 2 new process documents",
      "Concise standup updates appreciated by the team",
    ],
    "bm-cross-functional": [
      "Collaborated with Design, Backend, and QA teams this week",
      "Shared learnings from external conference with broader org",
      "Drove a cross-team alignment session that unblocked two teams",
      "Joined a working group outside primary team scope",
    ],
    "bm-ai-adoption": [
      "Used Copilot in 12 coding sessions this week",
      "Generated first draft of technical spec with AI assistance",
      "Automated a manual reporting task using an AI workflow",
      "Shared AI prompt template with team that saved 3 hours collectively",
    ],
    "bm-mentorship": [
      "Held 2 structured 1-on-1s with mentee this week",
      "Delivered in-depth code review that mentee called most helpful ever",
      "Pair-programmed for 90 minutes on a tricky architecture problem",
      "Mentee shipped their first independent feature after coaching sessions",
    ],
    "bm-proactive": [
      "Identified and resolved a production risk before it became an incident",
      "Proposed a process improvement that was adopted by the team",
      "Completed stretch tasks without being asked",
      "Flagged a dependency risk two sprints early, enabling proactive planning",
    ],
    "bm-work-life": [
      "Healthy work hours all 5 days — no sessions past 6:30pm",
      "Took regular breaks throughout each day",
      "Zero work activity on the weekend",
      "Maintained consistent 7.5-8 hour days all week",
    ],
  };

  // ── Insert benchmarks (UUIDs auto-generated) ────────────────────────

  const insertedBenchmarks = await db
    .insert(schema.benchmarks)
    .values(
      BENCHMARKS.map((bm) => ({
        organizationId,
        name: bm.name,
        description: bm.description,
        category: bm.category,
        metric: bm.metric,
        targetValue: bm.targetValue,
        unit: bm.unit,
        frequency: bm.frequency,
        isActive: true,
      }))
    )
    .returning();

  // Map original slug IDs to real UUIDs for lookup in config maps
  const slugToUuid: Record<string, string> = {};
  BENCHMARKS.forEach((bm, i) => {
    slugToUuid[bm.id] = insertedBenchmarks[i].id;
  });

  console.log(`  ✓ Created ${insertedBenchmarks.length} benchmarks`);

  // ── Insert parameters for each benchmark ──────────────────────────────

  let totalParameters = 0;
  for (let i = 0; i < insertedBenchmarks.length; i++) {
    const bm = insertedBenchmarks[i];
    const slug = BENCHMARKS[i].id;
    const params = BENCHMARK_PARAMETERS[slug];
    if (!params || params.length === 0) continue;
    await db.insert(schema.benchmarkParameters).values(
      params.map((p) => ({
        benchmarkId: bm.id,
        name: p.name,
        description: p.description,
        importance: p.importance,
      }))
    );
    totalParameters += params.length;
  }

  console.log(`  ✓ Created ${totalParameters} benchmark parameters`);

  // ── Insert assignments, snapshots, suggestions, and accomplishments ────

  let totalAssignments = 0;
  let totalSnapshots = 0;
  let totalSuggestions = 0;
  let totalAccomplishments = 0;

  const today = new Date();
  const recentDate1 = new Date(today);
  recentDate1.setDate(today.getDate() - 2);
  const recentDate2 = new Date(today);
  recentDate2.setDate(today.getDate() - 5);
  const recentDate3 = new Date(today);
  recentDate3.setDate(today.getDate() - 9);
  const recentDate4 = new Date(today);
  recentDate4.setDate(today.getDate() - 13);

  const recentDates = [recentDate1, recentDate2, recentDate3, recentDate4];

  const formatDate = (d: Date) => d.toISOString().slice(0, 10);

  for (let bmIdx = 0; bmIdx < insertedBenchmarks.length; bmIdx++) {
    const bm = insertedBenchmarks[bmIdx];
    const slug = BENCHMARKS[bmIdx].id;
    const configs = ASSIGNMENT_CONFIGS[slug];
    if (!configs || configs.length === 0) continue;

    for (const cfg of configs) {
      const user = users[cfg.userIndex];
      if (!user) continue;

      // Insert assignment
      const [assignment] = await db
        .insert(schema.benchmarkAssignments)
        .values({
          benchmarkId: bm.id,
          userId: user.id,
          targetValue: bm.targetValue,
          currentValue: cfg.currentValue,
          progress: cfg.progress,
          percentile: cfg.percentile,
          trend: cfg.trend,
          trendDelta: cfg.trendDelta,
        })
        .returning();

      totalAssignments++;

      // Insert 8 weekly snapshots (values are 0-100 progress scale)
      const snapshots = [];
      for (let week = 7; week >= 0; week--) {
        const snapshotDate = new Date(today);
        snapshotDate.setDate(today.getDate() - week * 7);
        const baseProgress = cfg.progress * 0.7;
        const progression = (7 - week) / 7;
        const rawProgress =
          baseProgress + (cfg.progress - baseProgress) * progression + (Math.random() * 6 - 3);
        const snapshotValue = Math.min(100, Math.max(0, Math.round(rawProgress * 10) / 10));
        snapshots.push({
          assignmentId: assignment.id,
          date: formatDate(snapshotDate),
          value: snapshotValue,
          target: 100,
        });
      }
      await db.insert(schema.benchmarkSnapshots).values(snapshots);
      totalSnapshots += snapshots.length;

      // Insert suggestions
      const suggestions = SUGGESTIONS_BY_BENCHMARK[slug] ?? [];
      if (suggestions.length > 0) {
        await db.insert(schema.benchmarkSuggestions).values(
          suggestions.map((s) => ({
            assignmentId: assignment.id,
            text: s.text,
            category: s.category,
          }))
        );
        totalSuggestions += suggestions.length;
      }

      // Insert accomplishments (2-4 based on available text list)
      const allAccomplishments = ACCOMPLISHMENTS_BY_BENCHMARK[slug] ?? [];
      // Give higher-progress users more accomplishments
      const count = cfg.progress >= 90 ? 4 : cfg.progress >= 70 ? 3 : 2;
      const selectedAccomplishments = allAccomplishments.slice(0, count);
      if (selectedAccomplishments.length > 0) {
        await db.insert(schema.benchmarkAccomplishments).values(
          selectedAccomplishments.map((text, i) => ({
            assignmentId: assignment.id,
            text,
            date: formatDate(recentDates[i % recentDates.length]),
          }))
        );
        totalAccomplishments += selectedAccomplishments.length;
      }
    }
  }

  console.log(`  ✓ Created ${totalAssignments} benchmark assignments`);
  console.log(`  ✓ Created ${totalSnapshots} benchmark snapshots`);
  console.log(`  ✓ Created ${totalSuggestions} benchmark suggestions`);
  console.log(`  ✓ Created ${totalAccomplishments} benchmark accomplishments`);
  console.log(`✅ Benchmarks seeded successfully`);

  return { benchmarks: insertedBenchmarks, totalAssignments, totalSnapshots };
}

async function seedIntegrations(organizationId: string) {
  console.log("🔌 Seeding integrations...");

  const integrations = await db
    .insert(schema.integrations)
    .values([
      {
        organizationId,
        provider: "slack",
        status: "disconnected", // Changed: No real token, so disconnected
        accessTokenEncrypted: "", // Empty for disconnected integrations
        syncFrequency: "6 hours",
        metadata: {},
      },
      {
        organizationId,
        provider: "notion",
        status: "disconnected", // Changed: No real token, so disconnected
        accessTokenEncrypted: "", // Empty for disconnected integrations
        syncFrequency: "6 hours",
        metadata: {},
      },
      {
        organizationId,
        provider: "github",
        status: "disconnected",
        accessTokenEncrypted: "", // Empty for disconnected integrations
        syncFrequency: "24 hours",
        metadata: {
          organization: "lorikeet-ai",
        },
      },
      {
        organizationId,
        provider: "google-drive",
        status: "disconnected",
        accessTokenEncrypted: "", // Empty for disconnected integrations
        syncFrequency: "24 hours",
        metadata: {},
      },
    ])
    .returning();

  console.log(`✅ Created ${integrations.length} integrations`);
  return integrations;
}

// ============================================
// Main Seed Function
// ============================================

async function seed() {
  try {
    console.log("🌱 Starting database seed for Lorikeet...\n");

    // Clear Supabase Auth users first
    console.log("🧹 Clearing Supabase Auth users...");
    const {
      data: { users: authUsers },
      error: listError,
    } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing auth users:", listError);
    } else if (authUsers && authUsers.length > 0) {
      for (const user of authUsers) {
        await supabase.auth.admin.deleteUser(user.id);
      }
      console.log(`✅ Deleted ${authUsers.length} Supabase Auth users`);
    }

    // Clear all database tables (idempotent seeding)
    console.log("🧹 Clearing database tables...");
    await reset(db, schema);
    console.log("✅ Database cleared\n");

    // Seed in order (respecting foreign keys)
    const organization = await seedOrganization();
    const users = await seedUsers(organization.id);
    const { conversations, messages } = await seedConversations(users);
    const integrations = await seedIntegrations(organization.id);
    const benchmarkResult = await seedBenchmarks(organization.id, users);

    console.log("\n📊 Seed Summary:");
    console.log(`  - Organization: ${organization.name}`);
    console.log(
      `  - Users: ${users.length} (${users.filter((u) => u.role === "admin").length} admins, ${users.filter((u) => u.role === "employee").length} employees)`
    );
    console.log(`  - Conversations: ${conversations.length}`);
    console.log(`  - Messages: ${messages.length}`);
    console.log(`  - Integrations: ${integrations.length}`);
    console.log(`  - Benchmarks: ${benchmarkResult.benchmarks.length}`);
    console.log(`  - Benchmark Assignments: ${benchmarkResult.totalAssignments}`);
    console.log(`  - Benchmark Snapshots: ${benchmarkResult.totalSnapshots}`);

    console.log("\n🎉 Database seeded successfully!");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seed
seed();
