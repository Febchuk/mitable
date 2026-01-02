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

async function linkTasksToSources(materials: schema.SourceMaterial[]) {
  console.log("🔗 Linking tasks to source materials...");

  // Fetch all roadmap template tasks
  const allTasks = await db.query.roadmapTemplateTasks.findMany();

  const junctionEntries: schema.NewRoadmapTemplateSource[] = [];

  // Helper function to find materials by keywords
  const findMaterialsByKeywords = (
    keywords: string[],
    limit: number = 4
  ): schema.SourceMaterial[] => {
    const matches: Map<string, number> = new Map();

    materials.forEach((material) => {
      let score = 0;
      const searchText = `${material.title} ${material.description}`.toLowerCase();

      keywords.forEach((keyword) => {
        if (searchText.includes(keyword.toLowerCase())) {
          score++;
        }
      });

      if (score > 0) {
        matches.set(material.id, score);
      }
    });

    // Sort by score and return top matches
    const sorted = Array.from(matches.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => materials.find((m) => m.id === id)!);

    return sorted;
  };

  // Link each task to 3-4 relevant source materials
  for (const task of allTasks) {
    const searchText = `${task.title} ${task.description || ""}`.toLowerCase();

    let relevantMaterials: schema.SourceMaterial[] = [];

    // Development environment setup
    if (
      searchText.includes("setup") ||
      searchText.includes("environment") ||
      searchText.includes("install")
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Setup Guide",
        "Architecture",
        "API Reference",
        "Database",
      ]);
    }
    // LangChain / AI agent tasks
    else if (
      searchText.includes("langchain") ||
      (searchText.includes("agent") && searchText.includes("build"))
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "LangChain",
        "Building Your First Agent",
        "LLM Integration",
        "Agent Architecture",
      ]);
    }
    // Prompt engineering
    else if (searchText.includes("prompt")) {
      relevantMaterials = findMaterialsByKeywords([
        "Prompt Engineering",
        "LLM Integration",
        "Building Your First Agent",
        "Agent Context",
      ]);
    }
    // RAG / retrieval
    else if (searchText.includes("rag") || searchText.includes("retrieval")) {
      relevantMaterials = findMaterialsByKeywords([
        "RAG Pipeline",
        "LLM Integration",
        "Agent Context",
        "Architecture",
      ]);
    }
    // Multi-agent orchestration
    else if (searchText.includes("multi-agent") || searchText.includes("orchestration")) {
      relevantMaterials = findMaterialsByKeywords([
        "Multi-Agent",
        "Agent Architecture",
        "Agent Context",
        "Building Your First Agent",
      ]);
    }
    // API integration
    else if (
      searchText.includes("api") ||
      (searchText.includes("integration") && searchText.includes("external"))
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "API Integration",
        "API Reference",
        "code_sample",
        "Architecture",
      ]);
    }
    // Context management
    else if (searchText.includes("context")) {
      relevantMaterials = findMaterialsByKeywords([
        "Agent Context",
        "Agent Architecture",
        "LLM Integration",
        "RAG Pipeline",
      ]);
    }
    // Deployment
    else if (
      searchText.includes("deploy") ||
      searchText.includes("production") ||
      searchText.includes("staging")
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Deployment",
        "Infrastructure",
        "Monitoring",
        "CI/CD",
      ]);
    }
    // Monitoring / debugging
    else if (
      searchText.includes("monitor") ||
      searchText.includes("debug") ||
      searchText.includes("observability")
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Monitoring",
        "Deployment",
        "Infrastructure",
        "Architecture",
      ]);
    }
    // Design system
    else if (searchText.includes("design system") || searchText.includes("figma")) {
      relevantMaterials = findMaterialsByKeywords([
        "Design System",
        "Figma",
        "Component Library",
        "Product Demo",
      ]);
    }
    // Product / roadmap
    else if (
      searchText.includes("product") ||
      searchText.includes("roadmap") ||
      searchText.includes("prd")
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Product Roadmap",
        "Product Demo",
        "Design System",
        "API Reference",
      ]);
    }
    // Customer success / platform training
    else if (
      searchText.includes("platform training") ||
      (searchText.includes("customer") && searchText.includes("onboarding"))
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Platform Training",
        "Customer Communication",
        "Escalation",
        "Product Demo",
      ]);
    }
    // Sales / demo
    else if (searchText.includes("demo") || searchText.includes("sales")) {
      relevantMaterials = findMaterialsByKeywords([
        "Sales Playbook",
        "Demo Environment",
        "Product Demo",
        "Objection Handling",
      ]);
    }
    // Codebase / architecture review
    else if (
      searchText.includes("codebase") ||
      searchText.includes("architecture") ||
      searchText.includes("monorepo")
    ) {
      relevantMaterials = findMaterialsByKeywords([
        "Architecture",
        "Setup Guide",
        "API Reference",
        "Database",
      ]);
    }
    // Testing
    else if (searchText.includes("test")) {
      relevantMaterials = findMaterialsByKeywords([
        "code_sample",
        "API Reference",
        "Architecture",
        "Setup Guide",
      ]);
    }
    // Default: general engineering resources
    else {
      relevantMaterials = findMaterialsByKeywords([
        "Architecture",
        "API Reference",
        "Setup Guide",
        "Product Demo",
      ]);
    }

    // Ensure we have 3-4 materials per task
    if (relevantMaterials.length < 3) {
      // Add more general materials to reach at least 3
      const additionalMaterials = materials
        .filter((m) => !relevantMaterials.includes(m))
        .slice(0, 4 - relevantMaterials.length);
      relevantMaterials = [...relevantMaterials, ...additionalMaterials];
    }

    // Take top 3-4 materials
    relevantMaterials = relevantMaterials.slice(0, 4);

    // Create junction table entries
    for (const material of relevantMaterials) {
      junctionEntries.push({
        templateTaskId: task.id,
        sourceId: material.id,
      });
    }
  }

  // Insert all junction table entries
  if (junctionEntries.length > 0) {
    await db.insert(schema.roadmapTemplateSources).values(junctionEntries);
  }

  console.log(
    `✅ Linked ${junctionEntries.length} task-source associations (${allTasks.length} tasks × ~3-4 sources each)`
  );
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
    const materials = await seedSourceMaterials(organization.id);
    const templates = await seedTemplates(organization.id, materials);
    await linkTasksToSources(materials); // Link roadmap tasks to source materials
    const assignments = await seedUserAssignments(users, templates);
    const userTasks = await seedUserTasks(users, templates);
    const { conversations, messages } = await seedConversations(users);
    const integrations = await seedIntegrations(organization.id);

    console.log("\n📊 Seed Summary:");
    console.log(`  - Organization: ${organization.name}`);
    console.log(
      `  - Users: ${users.length} (${users.filter((u) => u.role === "admin").length} admins, ${users.filter((u) => u.role === "employee").length} employees)`
    );
    console.log(`  - Source Materials: ${materials.length}`);
    console.log(`  - Templates: ${templates.length}`);
    console.log(`  - User Assignments: ${assignments.length}`);
    console.log(`  - User Tasks: ${userTasks.length}`);
    console.log(`  - Conversations: ${conversations.length}`);
    console.log(`  - Messages: ${messages.length}`);
    console.log(`  - Integrations: ${integrations.length}`);

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
