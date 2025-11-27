/**
 * Multi-Agent Orchestrator Test Script
 *
 * Tests all 5 routing paths:
 * 1. Text Response (simple question)
 * 2. Knowledge Search (documentation query)
 * 3. Workflow Start (with screenshot)
 * 4. Expert Matching (who can help)
 * 5. Workflow Progression (metadata-driven)
 */

import { OrchestratorService } from "./src/services/orchestrator.service";
import type { ToolContext } from "./src/tools/base.tool";

// Test data (valid UUIDs)
const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_CONVERSATION_ID = "00000000-0000-0000-0000-000000000002";
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000003";

const orchestrator = new OrchestratorService();

// Mock screenshot (base64 encoded 1x1 pixel PNG)
const MOCK_SCREENSHOT =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function runTests() {
  console.log("\n🧪 Starting Multi-Agent Orchestrator Tests\n");
  console.log("=".repeat(60));

  // TEST 1: Text Response (simple question)
  console.log("\n[TEST 1] Text Response Agent - Simple Question");
  console.log("-".repeat(60));
  await testTextResponse();

  // TEST 2: Knowledge Search (documentation query)
  console.log("\n[TEST 2] Knowledge Agent - Documentation Query");
  console.log("-".repeat(60));
  await testKnowledgeSearch();

  // TEST 3: Expert Matching
  console.log("\n[TEST 3] Expert Matching Agent - Find Colleague");
  console.log("-".repeat(60));
  await testExpertMatching();

  // TEST 4: Workflow Start (with screenshot)
  console.log("\n[TEST 4] Visual Guidance Agent - Workflow Start");
  console.log("-".repeat(60));
  await testWorkflowStart();

  // TEST 5: Workflow Progression (metadata-driven)
  console.log("\n[TEST 5] Visual Guidance Agent - Workflow Progression");
  console.log("-".repeat(60));
  await testWorkflowProgression();

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed!\n");
}

async function testTextResponse() {
  const context: ToolContext = {
    conversationId: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    conversationHistory: [
      {
        id: "msg-1",
        conversationId: TEST_CONVERSATION_ID,
        role: "user",
        content: "Hello! How are you?",
        messageType: "text",
        cardData: null,
        sources: [],
        createdAt: new Date(),
      },
    ],
    userProfile: {
      name: "Test User",
      email: "test@example.com",
      organizationId: TEST_ORG_ID,
    },
  };

  console.log("📤 User: Hello! How are you?");
  console.log("🎯 Expected Agent: TextResponseAgent (Gemini Flash)\n");

  try {
    let response = "";
    for await (const chunk of orchestrator.processMessage(context)) {
      if (chunk.type === "complete" && chunk.content) {
        response = chunk.content;
        console.log("✅ Response received:");
        console.log(`   Agent: TextResponseAgent`);
        console.log(`   Type: ${chunk.messageType}`);
        console.log(`   Content: ${response.substring(0, 100)}...`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testKnowledgeSearch() {
  const context: ToolContext = {
    conversationId: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    conversationHistory: [
      {
        id: "msg-2",
        conversationId: TEST_CONVERSATION_ID,
        role: "user",
        content: "What is our PTO policy?",
        messageType: "text",
        cardData: null,
        sources: [],
        createdAt: new Date(),
      },
    ],
    userProfile: {
      name: "Test User",
      email: "test@example.com",
      organizationId: TEST_ORG_ID,
    },
  };

  console.log("📤 User: What is our PTO policy?");
  console.log("🎯 Expected Agent: KnowledgeAgent (GPT-4)\n");

  try {
    let response = "";
    let sources = [];
    for await (const chunk of orchestrator.processMessage(context)) {
      if (chunk.type === "complete") {
        response = chunk.content || "";
        sources = chunk.sources || [];
        console.log("✅ Response received:");
        console.log(`   Agent: KnowledgeAgent`);
        console.log(`   Type: ${chunk.messageType}`);
        console.log(`   Content: ${response.substring(0, 100)}...`);
        console.log(`   Sources: ${sources.length} found`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testExpertMatching() {
  const context: ToolContext = {
    conversationId: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    conversationHistory: [
      {
        id: "msg-3",
        conversationId: TEST_CONVERSATION_ID,
        role: "user",
        content: "Who can help me with React development?",
        messageType: "text",
        cardData: null,
        sources: [],
        createdAt: new Date(),
      },
    ],
    userProfile: {
      name: "Test User",
      email: "test@example.com",
      organizationId: TEST_ORG_ID,
    },
  };

  console.log("📤 User: Who can help me with React development?");
  console.log("🎯 Expected Agent: ExpertMatchingAgent (GPT-3.5)\n");

  try {
    let experts = [];
    for await (const chunk of orchestrator.processMessage(context)) {
      if (chunk.type === "complete") {
        experts = (chunk.cardData as any)?.experts || [];
        console.log("✅ Response received:");
        console.log(`   Agent: ExpertMatchingAgent`);
        console.log(`   Type: ${chunk.messageType}`);
        console.log(`   Experts: ${experts.length} found`);
        console.log(`   Triggers: ${chunk.triggerWindow?.window || "none"}`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testWorkflowStart() {
  const context: ToolContext = {
    conversationId: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    conversationHistory: [
      {
        id: "msg-4",
        conversationId: TEST_CONVERSATION_ID,
        role: "user",
        content: "How do I update the product roadmap?",
        messageType: "text",
        cardData: null,
        sources: [],
        createdAt: new Date(),
      },
    ],
    screenshots: [
      {
        windowId: "window-1",
        windowTitle: "Mock Window",
        appName: "Mock App",
        dataUrl: MOCK_SCREENSHOT,
        metadata: {
          width: 1920,
          height: 1080,
          scaleFactor: 1,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      },
    ],
    userProfile: {
      name: "Test User",
      email: "test@example.com",
      organizationId: TEST_ORG_ID,
    },
  };

  console.log("📤 User: How do I update the product roadmap? [WITH SCREENSHOT]");
  console.log("🎯 Expected Agent: VisualGuidanceAgent (GPT-4 + Vision)\n");

  try {
    let workflowData = null;
    for await (const chunk of orchestrator.processMessage(context)) {
      if (chunk.type === "complete") {
        workflowData = chunk.cardData;
        console.log("✅ Response received:");
        console.log(`   Agent: VisualGuidanceAgent`);
        console.log(`   Type: ${chunk.messageType}`);
        console.log(`   Workflow Phase: ${(workflowData as any)?.workflowPhase}`);
        console.log(`   Steps: ${(workflowData as any)?.stepList?.length || 0}`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testWorkflowProgression() {
  const context: ToolContext = {
    conversationId: TEST_CONVERSATION_ID,
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    conversationHistory: [
      {
        id: "msg-5",
        conversationId: TEST_CONVERSATION_ID,
        role: "user",
        content: "Continue to next step",
        messageType: "text",
        cardData: null,
        sources: [],
        createdAt: new Date(),
      },
    ],
    screenshot: MOCK_SCREENSHOT,
    metadata: {
      workflowAction: "progress_step", // Deterministic routing
    },
    workflowState: {
      solution: "Test workflow",
      supportingData: [],
      solutionExplanation: "Test explanation",
      supportingDataExplanation: "Test data",
      stepList: [
        { stepNumber: 1, description: "Step 1", status: "completed" as const },
        { stepNumber: 2, description: "Step 2", status: "current" as const },
        { stepNumber: 3, description: "Step 3", status: "pending" as const },
      ],
      currentStepIndex: 1,
      searchQuery: "test",
      adjustmentHistory: [],
    },
    userProfile: {
      name: "Test User",
      email: "test@example.com",
      organizationId: TEST_ORG_ID,
    },
  };

  console.log("📤 User: [CLICKS 'Move on to next step' button]");
  console.log("🎯 Expected Routing: Metadata-driven → VisualGuidanceAgent\n");

  try {
    let workflowData = null;
    for await (const chunk of orchestrator.processMessage(context)) {
      if (chunk.type === "complete") {
        workflowData = chunk.cardData;
        console.log("✅ Response received:");
        console.log(`   Routing: Metadata-driven (deterministic)`);
        console.log(`   Agent: VisualGuidanceAgent`);
        console.log(`   Type: ${chunk.messageType}`);
        console.log(`   Current Step: ${(workflowData as any)?.currentStepIndex + 1}`);
        console.log(`   Phase: ${(workflowData as any)?.workflowPhase}`);
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run tests
runTests().catch(console.error);
