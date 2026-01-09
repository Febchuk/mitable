import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

/**
 * Title Generation Service
 *
 * Uses Gemini 2.0 Flash to generate concise, meaningful conversation titles
 * from the first user message and AI response.
 *
 * Model: Gemini 2.0 Flash (fast and cost-effective: ~$0.0001 per title)
 */
class TitleGenerationService {
  private genai: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genai = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genai.getGenerativeModel({
      model: "gemini-2.5-flash",
    });
  }

  /**
   * Generate a concise title from conversation content
   *
   * @param userMessage - First user message content
   * @param assistantResponse - First AI response content
   * @returns Concise title (max 60 characters)
   */
  async generateTitle(userMessage: string, assistantResponse: string): Promise<string> {
    console.log("[TitleGenerationService] Generating title for conversation");

    const prompt = `You are a conversation title generator. Your job is to create concise, meaningful titles for conversations based on the first exchange.

User's question: "${userMessage}"

Assistant's response: "${assistantResponse}"

Generate a short, descriptive title for this conversation that captures the main topic or question. The title should:
- Be concise (maximum 60 characters)
- Be specific and descriptive (not generic like "Help with Question")
- Focus on the user's intent or the main topic
- Use natural language (not just keywords)
- Avoid quotation marks around the title

Examples of good titles:
- "Setting up development environment"
- "How to submit expense reports"
- "Understanding the product roadmap"
- "Access to Slack workspace"
- "Creating a new Git branch"

Examples of bad titles (too generic):
- "Help with Task"
- "Question about Work"
- "How to do something"

Generate ONLY the title text, with no additional explanation or formatting. Do not include quotes around the title.`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let title = response.text().trim();

      // Remove any surrounding quotes that the model might add
      title = title.replace(/^["']|["']$/g, "");

      // Truncate if still too long (should rarely happen)
      if (title.length > 60) {
        title = title.substring(0, 57) + "...";
      }

      // Fallback if title is empty or too short
      if (!title || title.length < 3) {
        console.warn("[TitleGenerationService] Generated title too short, using fallback");
        title = userMessage.slice(0, 57) + "...";
      }

      console.log("[TitleGenerationService] Title generated:", title);
      return title;
    } catch (error) {
      console.error("[TitleGenerationService] Error generating title:", error);

      // Fallback: use truncated user message
      const fallbackTitle = userMessage.slice(0, 57) + (userMessage.length > 57 ? "..." : "");
      console.log("[TitleGenerationService] Using fallback title:", fallbackTitle);
      return fallbackTitle;
    }
  }
}

// Export singleton instance
export const titleGenerationService = new TitleGenerationService();
