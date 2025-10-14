import type { Request, Response } from "express";
import { generateEmbedding } from "./packages/shared-services/embedding.service.js";
import { queryVectors } from "./packages/shared-services/pinecone.service.js";
import { formatContext, buildContextString } from "./packages/shared-services/context.service.js";
import { generateChatCompletion, buildRAGSystemPrompt } from "./packages/shared-services/llm.service.js";
import { analyzeIntent } from "./packages/shared-services/intent.service.js";
import { applyTrustRanking } from "./packages/shared-services/trust-ranking.service.js";
import { parseDateRange } from "./packages/shared-utils/date-parser.js";
import type { ChatRequest } from "./packages/shared-types/chat.types";

/**
 * Main chat handler - orchestrates the RAG pipeline
 */
export async function handleChat(req: Request, res: Response) {
  try {
    const { message, conversationHistory = [] }: ChatRequest = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log("\n" + "=".repeat(80));
    console.log("USER QUERY:", message);
    console.log("=".repeat(80));

    const indexName = process.env.PINECONE_INDEX_NAME || "default";

    // Step 1: Analyze intent to determine if RAG is needed
    console.log("Analyzing intent...");
    const intent = await analyzeIntent({ message, conversationHistory });

    // If no context needed, respond directly
    if (!intent.needsContext) {
      console.log(`Intent: ${intent.type}, skipping RAG`);
      
      let systemPrompt = "You are the Mitable Agent, an intelligent assistant for Mitable, an onboarding platform company.";
      
      if (intent.type === "greeting") {
        systemPrompt += " Respond warmly and professionally to greetings. Introduce yourself as the Mitable Agent and offer to help with company information.";
      } else if (intent.type === "general") {
        systemPrompt += " Answer general questions helpfully. Note that for company-specific information about Mitable, the user should ask directly about the company.";
      }
      
      const response = await generateChatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content
          })),
          { role: "user", content: message }
        ]
      });

      console.log("\n" + "=".repeat(80));
      console.log("AI RESPONSE (no RAG):");
      console.log(response.content);
      console.log("=".repeat(80) + "\n");

      return res.json({
        response: response.content,
        sources: [],
        usage: response.usage,
        intent: intent.type
      });
    }

    // Step 2: Generate embedding (only if RAG needed)
    console.log(`Intent: ${intent.type}, proceeding with RAG`);
    console.log("Generating embedding for message:", message);
    const embedding = await generateEmbedding({ text: message });

    // Step 3: Parse date range
    const dateRange = parseDateRange(message);
    if (dateRange.type !== "none") {
      const start = new Date(dateRange.startTimestamp * 1000);
      const end = new Date(dateRange.endTimestamp * 1000);
      console.log(`Date filter: ${start.toDateString()} to ${end.toDateString()}`);
    }

    // Step 4: Query Pinecone
    console.log("Querying Pinecone index:", indexName);
    // For date queries, get WAY more results since we want everything from that date
    const topK = dateRange.type !== "none" ? 100 : 20;
    const matches = await queryVectors({
      embedding,
      indexName,
      topK,
      dateRange
    });

    console.log(`Pinecone returned ${matches.length} matches`);

    // Step 5: Apply trust-based ranking (skip for date queries)
    const hasDateFilter = dateRange.type !== "none";
    const rankedMatches = applyTrustRanking(matches, intent, hasDateFilter);

    // Step 6: Format context
    // For date queries, skip threshold entirely (we want ALL results from that date)
    const isDateQuery = dateRange.type === "single-date" || dateRange.type === "date-range";
    const scoreThreshold = isDateQuery ? 0.0 : 0.2;
    
    const contexts = formatContext({ 
      matches: rankedMatches, 
      scoreThreshold,
      boostDocuments: false // Trust ranking handles this now
    });

    const contextString = buildContextString(contexts);
    console.log(`Formatted ${contexts.length} contexts (${contextString.length} chars)`);

    // Step 7: Generate AI response
    const systemPrompt = buildRAGSystemPrompt(contextString);
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content
      })),
      { role: "user" as const, content: message }
    ];

    console.log("Calling LLM...");
    const response = await generateChatCompletion({ messages });
    console.log("Response generated successfully");

    console.log("\n" + "=".repeat(80));
    console.log("AI RESPONSE:");
    console.log(response.content);
    console.log("=".repeat(80) + "\n");

    // Step 7: Return response
    return res.json({
      response: response.content,
      sources: matches.slice(0, 3).map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata
      })),
      usage: response.usage,
      intent: intent.type
    });

  } catch (error) {
    console.error("Error in chat handler:", error);
    return res.status(500).json({
      error: "Failed to process chat message",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
