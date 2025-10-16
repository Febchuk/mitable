import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { reset } from "drizzle-seed";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";

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

async function seedSourceMaterials(organizationId: string) {
  console.log("📚 Seeding source materials...");

  const materials = await db
    .insert(schema.sourceMaterials)
    .values([
      // Architecture & Engineering Docs
      {
        organizationId,
        title: "Lorikeet Agent Architecture Guide",
        type: "document",
        url: "https://docs.lorikeet.ai/architecture/agents",
        description:
          "Deep dive into our multi-agent orchestration system and how agents communicate",
      },
      {
        organizationId,
        title: "API Reference Documentation",
        type: "document",
        url: "https://docs.lorikeet.ai/api",
        description: "Complete REST API documentation with examples",
      },
      {
        organizationId,
        title: "Database Schema Overview",
        type: "document",
        url: "https://docs.lorikeet.ai/database",
        description: "PostgreSQL schema design and migration patterns",
      },
      {
        organizationId,
        title: "Codebase Setup Guide",
        type: "tutorial",
        url: "https://docs.lorikeet.ai/setup",
        description: "Step-by-step guide to set up your local development environment",
      },
      // LLM & AI Resources
      {
        organizationId,
        title: "LLM Integration Patterns",
        type: "document",
        url: "https://docs.lorikeet.ai/ai/llm-patterns",
        description: "Best practices for integrating OpenAI, Anthropic, and other LLM providers",
      },
      {
        organizationId,
        title: "Prompt Engineering Guide",
        type: "tutorial",
        url: "https://docs.lorikeet.ai/ai/prompt-engineering",
        description: "Learn how to craft effective prompts for customer service agents",
      },
      {
        organizationId,
        title: "Agent Context Management",
        type: "document",
        url: "https://docs.lorikeet.ai/ai/context",
        description: "How we maintain conversation context across multi-turn interactions",
      },
      {
        organizationId,
        title: "RAG Pipeline Architecture",
        type: "document",
        url: "https://docs.lorikeet.ai/ai/rag",
        description: "Retrieval-Augmented Generation implementation using Pinecone and embeddings",
      },
      // Code Samples
      {
        organizationId,
        title: "Building Your First Agent",
        type: "code_sample",
        url: "https://github.com/lorikeet/examples/first-agent",
        description: "Complete example of creating a customer service agent from scratch",
      },
      {
        organizationId,
        title: "Multi-Agent Orchestration Example",
        type: "code_sample",
        url: "https://github.com/lorikeet/examples/multi-agent",
        description: "Example showing how multiple agents collaborate to solve complex queries",
      },
      {
        organizationId,
        title: "API Integration Samples",
        type: "code_sample",
        url: "https://github.com/lorikeet/examples/api",
        description: "TypeScript and Python examples for common API use cases",
      },
      // Videos
      {
        organizationId,
        title: "Product Demo Walkthrough",
        type: "video",
        url: "https://vimeo.com/lorikeet/product-demo",
        description: "30-minute product demo covering all major features",
      },
      {
        organizationId,
        title: "Engineering Deep Dive: Agent System",
        type: "video",
        url: "https://vimeo.com/lorikeet/eng-agents",
        description: "Technical deep dive into our agent architecture (1 hour)",
      },
      {
        organizationId,
        title: "Customer Onboarding Best Practices",
        type: "video",
        url: "https://vimeo.com/lorikeet/cs-onboarding",
        description: "Learn how to onboard enterprise customers effectively",
      },
      // Product & Design
      {
        organizationId,
        title: "Lorikeet Design System",
        type: "document",
        url: "https://design.lorikeet.ai",
        description: "Complete design system with components, colors, and patterns",
      },
      {
        organizationId,
        title: "Figma Component Library",
        type: "link",
        url: "https://figma.com/@lorikeet/components",
        description: "Production-ready Figma components for all UI elements",
      },
      {
        organizationId,
        title: "Product Roadmap 2024",
        type: "document",
        url: "https://docs.lorikeet.ai/product/roadmap",
        description: "Product strategy and feature roadmap for the year",
      },
      // Customer Success
      {
        organizationId,
        title: "Platform Training Guide",
        type: "tutorial",
        url: "https://training.lorikeet.ai",
        description: "Complete platform training for customer success team",
      },
      {
        organizationId,
        title: "Customer Communication Templates",
        type: "document",
        url: "https://docs.lorikeet.ai/cs/templates",
        description: "Email templates and scripts for common customer scenarios",
      },
      {
        organizationId,
        title: "Escalation Procedures",
        type: "document",
        url: "https://docs.lorikeet.ai/cs/escalation",
        description: "When and how to escalate customer issues",
      },
      // Sales
      {
        organizationId,
        title: "Enterprise Sales Playbook",
        type: "document",
        url: "https://docs.lorikeet.ai/sales/playbook",
        description: "Complete sales methodology for enterprise deals",
      },
      {
        organizationId,
        title: "Technical Objection Handling",
        type: "document",
        url: "https://docs.lorikeet.ai/sales/objections",
        description: "How to address common technical concerns from prospects",
      },
      {
        organizationId,
        title: "Demo Environment Setup",
        type: "tutorial",
        url: "https://docs.lorikeet.ai/sales/demo-setup",
        description: "Set up your personalized demo environment",
      },
      // DevOps
      {
        organizationId,
        title: "Deployment Guide",
        type: "tutorial",
        url: "https://docs.lorikeet.ai/devops/deploy",
        description: "How to deploy to staging and production environments",
      },
      {
        organizationId,
        title: "Monitoring & Observability",
        type: "document",
        url: "https://docs.lorikeet.ai/devops/monitoring",
        description: "DataDog dashboards and alerting setup",
      },
      {
        organizationId,
        title: "Infrastructure as Code",
        type: "code_sample",
        url: "https://github.com/lorikeet/infrastructure",
        description: "Terraform configurations for our cloud infrastructure",
      },
      // External Resources
      {
        organizationId: null, // Global resource
        title: "LangChain Documentation",
        type: "link",
        url: "https://python.langchain.com/docs/get_started/introduction",
        description: "Official LangChain documentation for building with LLMs",
      },
      {
        organizationId: null,
        title: "OpenAI API Documentation",
        type: "link",
        url: "https://platform.openai.com/docs/introduction",
        description: "Complete guide to OpenAI's API",
      },
      {
        organizationId: null,
        title: "Anthropic Claude Documentation",
        type: "link",
        url: "https://docs.anthropic.com/",
        description: "Documentation for Claude API integration",
      },
    ])
    .returning();

  console.log(`✅ Created ${materials.length} source materials`);
  return materials;
}

async function seedTemplates(organizationId: string, _materials: schema.SourceMaterial[]) {
  console.log("📋 Seeding templates...");

  // AI/ML Engineer Template
  const [aiTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "AI/ML Engineer Onboarding",
      description:
        "Comprehensive onboarding for AI/ML engineers covering LLM integration, agent frameworks, and production deployment",
      icon: "Bot",
      color: "#8b5cf6",
      roleTags: ["AI/ML Engineer", "Engineering"],
      totalWeeks: 6,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: aiTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Set up development environment",
      description:
        "Install Python, Node.js, Docker, and configure your local environment for AI development",
      timeEstimate: "3 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Clone and explore the codebase",
      description:
        "Get familiar with our monorepo structure, agent orchestration layer, and key modules",
      timeEstimate: "4 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 1,
      orderIndex: 3,
      title: "Complete LangChain basics tutorial",
      description: "Work through LangChain documentation to understand chains, agents, and memory",
      timeEstimate: "6 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Build your first simple agent",
      description: "Create a basic customer service agent using our framework and test it locally",
      timeEstimate: "1 day",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Learn prompt engineering best practices",
      description:
        "Study our prompt engineering guide and experiment with different prompt strategies",
      timeEstimate: "4 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 2,
      orderIndex: 3,
      title: "Understand RAG pipeline architecture",
      description: "Deep dive into our Retrieval-Augmented Generation system with Pinecone",
      timeEstimate: "6 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Implement multi-agent orchestration",
      description: "Build a system where multiple agents collaborate to solve complex queries",
      timeEstimate: "2 days",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Integrate external APIs into agents",
      description: "Learn how to give agents tool-calling capabilities for external services",
      timeEstimate: "1 day",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 4,
      orderIndex: 1,
      title: "Study agent context management",
      description: "Understand how we maintain context across long conversations",
      timeEstimate: "4 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 4,
      orderIndex: 2,
      title: "Optimize agent performance",
      description: "Learn techniques for reducing latency and improving response quality",
      timeEstimate: "1 day",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 5,
      orderIndex: 1,
      title: "Deploy agent to staging",
      description: "Deploy your agent to our staging environment and run integration tests",
      timeEstimate: "6 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 5,
      orderIndex: 2,
      title: "Monitor and debug production agents",
      description: "Learn to use DataDog and our logging infrastructure to debug issues",
      timeEstimate: "4 hours",
    },
    {
      templateId: aiTemplate.id,
      weekNumber: 6,
      orderIndex: 1,
      title: "Ship your first production feature",
      description: "Complete a small production feature from design to deployment",
      timeEstimate: "2 days",
    },
  ]);

  // Engineering Template
  const [engTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "Engineering Onboarding",
      description:
        "General engineering onboarding covering codebase architecture, development workflows, and deployment",
      icon: "Code",
      color: "#3b82f6",
      roleTags: ["Backend Engineer", "Frontend Engineer", "Engineering"],
      totalWeeks: 4,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: engTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Complete development setup",
      description: "Set up your local environment with all required tools and dependencies",
      timeEstimate: "2 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Review codebase architecture",
      description:
        "Read architecture docs and understand our monorepo structure, backend services, and frontend apps",
      timeEstimate: "4 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 1,
      orderIndex: 3,
      title: "Run the application locally",
      description: "Get the full stack running on your machine and test key features",
      timeEstimate: "3 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Fix a good first issue",
      description: "Pick up a 'good first issue' from GitHub and submit your first PR",
      timeEstimate: "1 day",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Learn our CI/CD pipeline",
      description: "Understand how code moves from PR to staging to production",
      timeEstimate: "2 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Pair program with a senior engineer",
      description: "Schedule a 2-hour pairing session to learn team coding practices",
      timeEstimate: "2 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Write comprehensive tests",
      description: "Add unit and integration tests for your feature",
      timeEstimate: "4 hours",
    },
    {
      templateId: engTemplate.id,
      weekNumber: 4,
      orderIndex: 1,
      title: "Deploy a feature to production",
      description: "Ship your first feature all the way to production with monitoring",
      timeEstimate: "2 days",
    },
  ]);

  // Product Template
  const [productTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "Product Manager Onboarding",
      description:
        "Product management onboarding covering AI product strategy, customer workflows, and feature prioritization",
      icon: "Lightbulb",
      color: "#f59e0b",
      roleTags: ["Product Manager", "Product"],
      totalWeeks: 4,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: productTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Deep dive on product vision",
      description: "Meet with VP of Product to understand our product strategy and roadmap",
      timeEstimate: "2 hours",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Study customer workflows",
      description: "Shadow customer success team and watch customer demos to understand user needs",
      timeEstimate: "1 day",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Review analytics dashboards",
      description: "Get access to Amplitude and review key product metrics",
      timeEstimate: "3 hours",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Conduct user interviews",
      description: "Interview 3-5 customers to understand pain points and feature requests",
      timeEstimate: "1 day",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Write your first PRD",
      description: "Draft a Product Requirements Document for a small feature",
      timeEstimate: "1 day",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Present at product review",
      description: "Present your feature proposal at weekly product review meeting",
      timeEstimate: "3 hours",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 4,
      orderIndex: 1,
      title: "Prioritize feature backlog",
      description: "Work with engineering to prioritize and estimate upcoming features",
      timeEstimate: "4 hours",
    },
    {
      templateId: productTemplate.id,
      weekNumber: 4,
      orderIndex: 2,
      title: "Ship your first feature",
      description: "See your first feature through from conception to launch",
      timeEstimate: "2 days",
    },
  ]);

  // Customer Success Template
  const [csTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "Customer Success Onboarding",
      description:
        "Customer success onboarding covering platform training, customer communication, and support workflows",
      icon: "Users",
      color: "#10b981",
      roleTags: ["Customer Success", "Support"],
      totalWeeks: 3,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: csTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Complete platform training",
      description: "Go through comprehensive platform training to understand all features",
      timeEstimate: "1 day",
    },
    {
      templateId: csTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Shadow senior CS team member",
      description: "Shadow customer calls and support tickets to learn best practices",
      timeEstimate: "1 day",
    },
    {
      templateId: csTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Learn escalation procedures",
      description: "Understand when and how to escalate customer issues to engineering",
      timeEstimate: "2 hours",
    },
    {
      templateId: csTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Handle your first support tickets",
      description: "Respond to 5-10 customer support tickets with supervisor review",
      timeEstimate: "1 day",
    },
    {
      templateId: csTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Conduct customer onboarding call",
      description: "Lead your first customer onboarding call with a new customer",
      timeEstimate: "2 hours",
    },
    {
      templateId: csTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Document customer feedback",
      description: "Compile customer feedback and share insights with product team",
      timeEstimate: "3 hours",
    },
  ]);

  // Sales Template
  const [salesTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "Sales Onboarding",
      description:
        "Sales onboarding covering product demo training, sales process, and enterprise deal management",
      icon: "TrendingUp",
      color: "#ef4444",
      roleTags: ["Sales", "Account Executive"],
      totalWeeks: 3,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: salesTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Master the product demo",
      description: "Learn to deliver compelling product demos for different customer personas",
      timeEstimate: "1 day",
    },
    {
      templateId: salesTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Study sales playbook",
      description: "Review enterprise sales methodology and qualification criteria",
      timeEstimate: "4 hours",
    },
    {
      templateId: salesTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Shadow experienced AE on calls",
      description: "Join 5-10 sales calls to learn discovery questions and objection handling",
      timeEstimate: "2 days",
    },
    {
      templateId: salesTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Learn technical objection handling",
      description: "Understand how to address common technical concerns from prospects",
      timeEstimate: "3 hours",
    },
    {
      templateId: salesTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Lead your first demo",
      description: "Deliver a full product demo to a qualified prospect",
      timeEstimate: "2 hours",
    },
    {
      templateId: salesTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Close your first deal",
      description: "Navigate a full sales cycle from discovery to close",
      timeEstimate: "2 weeks",
    },
  ]);

  // Design Template
  const [designTemplate] = await db
    .insert(schema.roadmapTemplates)
    .values({
      organizationId,
      title: "Product Design Onboarding",
      description: "Design onboarding covering design system, AI UX patterns, and design workflow",
      icon: "Palette",
      color: "#ec4899",
      roleTags: ["Product Designer", "Design"],
      totalWeeks: 3,
    })
    .returning();

  await db.insert(schema.roadmapTemplateTasks).values([
    {
      templateId: designTemplate.id,
      weekNumber: 1,
      orderIndex: 1,
      title: "Study the design system",
      description: "Review our complete design system including components, colors, and spacing",
      timeEstimate: "4 hours",
    },
    {
      templateId: designTemplate.id,
      weekNumber: 1,
      orderIndex: 2,
      title: "Set up Figma workspace",
      description: "Get access to Figma and familiarize yourself with our component library",
      timeEstimate: "2 hours",
    },
    {
      templateId: designTemplate.id,
      weekNumber: 2,
      orderIndex: 1,
      title: "Learn AI UX patterns",
      description: "Study best practices for designing AI-powered conversational interfaces",
      timeEstimate: "6 hours",
    },
    {
      templateId: designTemplate.id,
      weekNumber: 2,
      orderIndex: 2,
      title: "Design a small feature",
      description: "Design mockups for a minor feature improvement with design review",
      timeEstimate: "1 day",
    },
    {
      templateId: designTemplate.id,
      weekNumber: 3,
      orderIndex: 1,
      title: "Conduct user testing",
      description: "Run usability tests with 3-5 users and synthesize findings",
      timeEstimate: "1 day",
    },
    {
      templateId: designTemplate.id,
      weekNumber: 3,
      orderIndex: 2,
      title: "Ship your first design",
      description: "Work with engineering to implement and ship your first design",
      timeEstimate: "2 days",
    },
  ]);

  const templates = [
    aiTemplate,
    engTemplate,
    productTemplate,
    csTemplate,
    salesTemplate,
    designTemplate,
  ];
  console.log(`✅ Created ${templates.length} templates with tasks`);
  return templates;
}

async function seedUserAssignments(users: schema.User[], templates: schema.RoadmapTemplate[]) {
  console.log("🔗 Seeding user template assignments...");

  const assignments = [];

  // Map users to appropriate templates based on their email (inferred role)
  const roleMapping = [
    { email: "emily@lorikeet.ai", templateIndex: 0 }, // AI/ML → AI Template
    { email: "alex@lorikeet.ai", templateIndex: 0 }, // AI/ML → AI Template
    { email: "jordan@lorikeet.ai", templateIndex: 0 }, // AI/ML → AI Template
    { email: "priya@lorikeet.ai", templateIndex: 1 }, // Backend → Engineering
    { email: "carlos@lorikeet.ai", templateIndex: 1 }, // Backend → Engineering
    { email: "jessica@lorikeet.ai", templateIndex: 1 }, // Frontend → Engineering
    { email: "miguel@lorikeet.ai", templateIndex: 1 }, // Frontend → Engineering
    { email: "rachel@lorikeet.ai", templateIndex: 2 }, // PM → Product
    { email: "james@lorikeet.ai", templateIndex: 2 }, // PM → Product
    { email: "sophie@lorikeet.ai", templateIndex: 3 }, // CS → Customer Success
    { email: "daniel@lorikeet.ai", templateIndex: 3 }, // CS → Customer Success
    { email: "olivia@lorikeet.ai", templateIndex: 4 }, // Sales → Sales
    { email: "ethan@lorikeet.ai", templateIndex: 5 }, // Design → Design
    { email: "maya@lorikeet.ai", templateIndex: 1 }, // DevOps → Engineering
  ];

  for (const mapping of roleMapping) {
    const user = users.find((u) => u.email === mapping.email);
    if (user) {
      assignments.push({
        userId: user.id,
        templateId: templates[mapping.templateIndex].id,
        status: "active",
      });
    }
  }

  const result = await db.insert(schema.userTemplateAssignments).values(assignments).returning();

  console.log(`✅ Created ${result.length} user template assignments`);
  return result;
}

async function seedUserTasks(users: schema.User[], templates: schema.RoadmapTemplate[]) {
  console.log("✅ Seeding user roadmap tasks...");

  // Fetch all template tasks
  const allTemplateTasks = await db.query.roadmapTemplateTasks.findMany({
    orderBy: (tasks, { asc }) => [asc(tasks.weekNumber), asc(tasks.orderIndex)],
  });

  const userTasks = [];

  // Map users to templates and create user tasks
  const userTemplateMap = [
    { email: "emily@lorikeet.ai", templateIndex: 0, week: 3 }, // AI Engineer, week 3
    { email: "alex@lorikeet.ai", templateIndex: 0, week: 1 }, // AI Engineer, week 1
    { email: "jordan@lorikeet.ai", templateIndex: 0, week: 5 }, // AI Engineer, week 5
    { email: "priya@lorikeet.ai", templateIndex: 1, week: 2 }, // Engineering, week 2
    { email: "carlos@lorikeet.ai", templateIndex: 1, week: 4 }, // Engineering, week 4
    { email: "jessica@lorikeet.ai", templateIndex: 1, week: 3 }, // Engineering, week 3
    { email: "miguel@lorikeet.ai", templateIndex: 1, week: 1 }, // Engineering, week 1
    { email: "rachel@lorikeet.ai", templateIndex: 2, week: 2 }, // Product, week 2
    { email: "james@lorikeet.ai", templateIndex: 2, week: 4 }, // Product, week 4
    { email: "sophie@lorikeet.ai", templateIndex: 3, week: 2 }, // CS, week 2
    { email: "daniel@lorikeet.ai", templateIndex: 3, week: 3 }, // CS, week 3
    { email: "olivia@lorikeet.ai", templateIndex: 4, week: 1 }, // Sales, week 1
    { email: "ethan@lorikeet.ai", templateIndex: 5, week: 2 }, // Design, week 2
    { email: "maya@lorikeet.ai", templateIndex: 1, week: 3 }, // Engineering, week 3
  ];

  for (const mapping of userTemplateMap) {
    const user = users.find((u) => u.email === mapping.email);
    if (!user) continue;

    const template = templates[mapping.templateIndex];
    const templateTasks = allTemplateTasks.filter((t) => t.templateId === template.id);

    for (const templateTask of templateTasks) {
      // Mark tasks as completed if they're in weeks before current week
      const isCompleted = templateTask.weekNumber < mapping.week;
      const completedAt = isCompleted
        ? new Date(Date.now() - (mapping.week - templateTask.weekNumber) * 7 * 24 * 60 * 60 * 1000)
        : null;

      userTasks.push({
        userId: user.id,
        templateId: template.id,
        templateTaskId: templateTask.id,
        weekNumber: templateTask.weekNumber,
        title: templateTask.title,
        description: templateTask.description,
        timeEstimate: templateTask.timeEstimate,
        orderIndex: templateTask.orderIndex,
        completed: isCompleted,
        completedAt: completedAt,
        isCustom: false,
      });
    }
  }

  // Add some custom tasks for specific users
  const emily = users.find((u) => u.email === "emily@lorikeet.ai");
  if (emily) {
    userTasks.push({
      userId: emily.id,
      templateId: null,
      templateTaskId: null,
      weekNumber: 3,
      title: "Review PR for agent optimization",
      description: "Senior engineer asked you to review their PR for performance improvements",
      timeEstimate: "2 hours",
      orderIndex: 99,
      completed: false,
      completedAt: null,
      isCustom: true,
    });
  }

  const rachel = users.find((u) => u.email === "rachel@lorikeet.ai");
  if (rachel) {
    userTasks.push({
      userId: rachel.id,
      templateId: null,
      templateTaskId: null,
      weekNumber: 2,
      title: "Shadow customer call with enterprise client",
      description: "Join Sarah for a strategic customer call with a Fortune 500 company",
      timeEstimate: "1 hour",
      orderIndex: 99,
      completed: false,
      completedAt: null,
      isCustom: true,
    });
  }

  const result = await db.insert(schema.userRoadmapTasks).values(userTasks).returning();

  console.log(`✅ Created ${result.length} user roadmap tasks`);
  return result;
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
    const materials = await seedSourceMaterials(organization.id);
    const templates = await seedTemplates(organization.id, materials);
    const assignments = await seedUserAssignments(users, templates);
    const userTasks = await seedUserTasks(users, templates);

    console.log("\n📊 Seed Summary:");
    console.log(`  - Organization: ${organization.name}`);
    console.log(
      `  - Users: ${users.length} (${users.filter((u) => u.role === "admin").length} admins, ${users.filter((u) => u.role === "employee").length} employees)`
    );
    console.log(`  - Source Materials: ${materials.length}`);
    console.log(`  - Templates: ${templates.length}`);
    console.log(`  - User Assignments: ${assignments.length}`);
    console.log(`  - User Tasks: ${userTasks.length}`);

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
