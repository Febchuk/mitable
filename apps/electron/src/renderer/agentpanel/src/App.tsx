import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./components/Header";
import EmptyState from "./components/EmptyState";
import ChatView from "./components/ChatView";
import ChatsListView from "./components/ChatsListView";
import InputBar from "./components/InputBar";
import {
  createConversation,
  sendMessageStream,
  getConversationMessages,
  pauseWorkflow,
} from "../../lib/api/conversations";
import type { SelectedWindowInfo } from "./global";
import type { MultiWindowCaptureResult } from "@mitable/shared";

type PanelView = "chat" | "chats-list";

// ============================================================
// Animation Presets - Change ANIMATION_PRESET to try different animations
// ============================================================
type AnimationPreset = "scale-pop" | "fade-bounce" | "slide-right" | "fade-drift";
const ANIMATION_PRESET: AnimationPreset = "scale-pop"; // <-- Default to scale-pop with vibrancy coordination

// Animation duration in ms (used for vibrancy coordination timing)
const ANIMATION_DURATION_MS = 250;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const animationVariants: Record<AnimationPreset, any> = {
  "scale-pop": {
    // Scale animation now works because window is transparent during animation
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
    transition: { duration: ANIMATION_DURATION_MS / 1000, ease: [0.34, 1.56, 0.64, 1] },
  },
  "fade-bounce": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: ANIMATION_DURATION_MS / 1000, ease: [0.34, 1.56, 0.64, 1] },
  },
  "slide-right": {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
    transition: { duration: 0.2, ease: "easeOut" },
  },
  "fade-drift": {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2, ease: "easeOut" },
  },
};

const currentAnimation = animationVariants[ANIMATION_PRESET];

// ============================================================
// Demo Mode Configuration
// ============================================================
const DEMO_MODE = true; // Set to true to enable demo mode with hardcoded messages

// Demo workflow session ID
const DEMO_WORKFLOW_SESSION_ID = "demo-workflow-123";
const DEMO_CONVERSATION_ID = "demo-conversation-123";

/**
 * Returns hardcoded demo messages for customer demo
 */
function getDemoMessages(): Message[] {
  const now = new Date();
  
  return [
    // Initial messages (outside workflow)
    {
      id: "demo-msg-1",
      role: "user",
      content: "Show me how to fix this bug",
      timestamp: new Date(now.getTime() - 10000),
      workflowSessionId: null,
      relatedStepIndex: null,
    },
    {
      id: "demo-msg-2",
      role: "assistant",
      content: "Based on your screen, you're likely talking about the file contamination error. Am I correct?",
      timestamp: new Date(now.getTime() - 8000),
      workflowSessionId: null,
      relatedStepIndex: null,
    },
    {
      id: "demo-msg-3",
      role: "user",
      content: "Yes",
      timestamp: new Date(now.getTime() - 6000),
      workflowSessionId: null,
      relatedStepIndex: null,
    },
  ];
}

// Demo workflow message ID (consistent across all workflow state updates)
const DEMO_WORKFLOW_MESSAGE_ID = "demo-workflow-message";

/**
 * Returns the pre-flight workflow message (shown after "Yes" confirmation)
 */
function getDemoWorkflowPreFlightMessage(): Message {
  return {
    id: DEMO_WORKFLOW_MESSAGE_ID,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    messageType: "workflow",
    workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
    relatedStepIndex: null,
    cardData: {
      solution: "Fix file contamination error",
      solutionExplanation: "This is happening because the app hasn't been signed with a developer account. Febe gave a workaround for this in Slack though, so I can help you fix it!",
      supportingData: [],
      supportingDataExplanation: "",
      stepList: [
        { stepNumber: 1, description: "Redownload the app", status: "pending" },
        { stepNumber: 2, description: "Run the following terminal command", status: "pending" },
      ],
      currentStepIndex: -1 as any, // Pre-flight mode (schema requires min(0) but UI handles -1)
      searchQuery: "file contamination error",
      adjustmentHistory: [],
      workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
      status: "active",
    },
  };
}

/**
 * Returns step 1 workflow message with guidance
 */
function getDemoStep1WorkflowMessage(): Message {
  return {
    id: DEMO_WORKFLOW_MESSAGE_ID,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    messageType: "workflow",
    workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
    relatedStepIndex: null,
    cardData: {
      solution: "Fix file contamination error",
      solutionExplanation: "This is happening because the app hasn't been signed with a developer account. Febe gave a workaround for this in Slack though, so I can help you fix it!",
      supportingData: [],
      supportingDataExplanation: "",
      stepList: [
        { stepNumber: 1, description: "Redownload the app", status: "current", guidance: "First you need to go back to this link to redownload the prod app." },
        { stepNumber: 2, description: "Run the following terminal command", status: "pending" },
      ],
      currentStepIndex: 0,
      searchQuery: "file contamination error",
      adjustmentHistory: [],
      workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
      status: "active",
    },
  };
}

/**
 * Returns step 2 workflow message with guidance
 */
function getDemoStep2WorkflowMessage(): Message {
  return {
    id: DEMO_WORKFLOW_MESSAGE_ID,
    role: "assistant",
    content: "",
    timestamp: new Date(),
    messageType: "workflow",
    workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
    relatedStepIndex: null,
    cardData: {
      solution: "Fix file contamination error",
      solutionExplanation: "This is happening because the app hasn't been signed with a developer account. Febe gave a workaround for this in Slack though, so I can help you fix it!",
      supportingData: [],
      supportingDataExplanation: "",
      stepList: [
        { stepNumber: 1, description: "Redownload the app", status: "completed" },
        { stepNumber: 2, description: "Run the following terminal command", status: "current", guidance: "Now open your terminal and run this command in it before opening the dmg file" },
      ],
      currentStepIndex: 1,
      searchQuery: "file contamination error",
      adjustmentHistory: [],
      workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
      status: "active",
    },
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageType?: "text" | "workflow" | "experts";
  isStreaming?: boolean;
  cardData?: unknown;
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
}

function App() {
  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Loading state for progress messages
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // User state
  const [userName] = useState("there");

  // Input mode state
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [isRecording, setIsRecording] = useState(false);

  // Watch mode state
  const [watchingScreen, setWatchingScreen] = useState(false);
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);

  // View state (chat view or chats list)
  const [currentView, setCurrentView] = useState<PanelView>("chat");

  // Animation visibility state
  const [isVisible, setIsVisible] = useState(true);

  // Workflow state
  const [workflowLoadingMessage, setWorkflowLoadingMessage] = useState<string | null>(null);
  const [awaitingCustomQuestion, setAwaitingCustomQuestion] = useState<{
    conversationId: string;
    workflowSessionId: string | null;
    relatedStepIndex: number | null;
  } | null>(null);

  // Demo mode state - tracks if demo has been triggered
  const [demoModeActive, setDemoModeActive] = useState(false);

  // Initialize auth token listener
  useEffect(() => {
    // Listen for auth token updates (tokens are managed by main process)
    window.agentPanelAPI?.onAuthTokenUpdated(() => {
      // Token updates are handled automatically by the API library
      console.log("[AgentPanel] Auth token updated");
    });

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Listen for panel show events to trigger entrance animation with vibrancy coordination
  useEffect(() => {
    window.agentPanelAPI?.onPanelShow(() => {
      // Turn on vibrancy first (frosted glass appears)
      window.agentPanelAPI?.vibrancyOn();
      // Then animate content in
      setIsVisible(true);
    });
  }, []);

  // Listen for conversation load requests from Console
  useEffect(() => {
    const handleLoadConversation = async (convId: string) => {
      console.log("[AgentPanel] Loading conversation:", convId);
      setConversationId(convId);

      // Fetch existing messages
      try {
        const existingMessages = await getConversationMessages(convId);
        setMessages(
          existingMessages.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: new Date(),
            messageType: msg.messageType as "text" | "workflow" | "experts",
            cardData: msg.cardData,
            workflowSessionId: msg.workflowSessionId,
            relatedStepIndex: msg.relatedStepIndex,
          }))
        );
      } catch (error) {
        console.error("[AgentPanel] Failed to load conversation:", error);
      }
    };
    window.agentPanelAPI?.onLoadConversation(handleLoadConversation);

    return () => {
      window.agentPanelAPI?.offLoadConversation(handleLoadConversation);
    };
  }, []);

  // Listen for watch mode window updates
  useEffect(() => {
    const handleWatchWindowsUpdated = (windows: SelectedWindowInfo[]) => {
      setSelectedWindows(windows);
    };
    window.agentPanelAPI?.onWatchWindowsUpdated(handleWatchWindowsUpdated);

    return () => {
      window.agentPanelAPI?.offWatchWindowsUpdated(handleWatchWindowsUpdated);
    };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || streamingMessageIdRef.current) return;

      const trimmedContent = content.trim().toLowerCase();

      // DEMO MODE: Check if this is the trigger message
      if (DEMO_MODE && !demoModeActive && trimmedContent.includes("show me how to fix this bug")) {
        setDemoModeActive(true);
        setConversationId(DEMO_CONVERSATION_ID);
        
        // Add user message immediately
        const userMessage1: Message = {
          id: `demo-msg-1`,
          role: "user",
          content: content.trim(),
          timestamp: new Date(),
          workflowSessionId: null,
          relatedStepIndex: null,
        };
        setMessages([userMessage1]);
        
        // Show assistant clarification after 1 second
        setTimeout(() => {
          const assistantMessage1: Message = {
            id: `demo-msg-2`,
            role: "assistant",
            content: "Based on your screen, you're likely talking about the file contamination error. Am I correct?",
            timestamp: new Date(),
            workflowSessionId: null,
            relatedStepIndex: null,
          };
          setMessages((prev) => [...prev, assistantMessage1]);
        }, 1000);
        
        return;
      }

      // DEMO MODE: Handle responses after demo is active
      if (DEMO_MODE && demoModeActive) {
        // Handle "Yes" response (confirms the bug) - show workflow pre-flight message
        // Check if we have exactly 2 messages (user question + assistant clarification)
        if (trimmedContent === "yes" && messages.length === 2 && messages[messages.length - 1].role === "assistant") {
          const userMessage: Message = {
            id: `demo-msg-3`,
            role: "user",
            content: content.trim(),
            timestamp: new Date(),
            workflowSessionId: null,
            relatedStepIndex: null,
          };
          setMessages((prev) => {
            const updated = [...prev, userMessage];
            // Add workflow pre-flight message immediately after "Yes"
            const workflowMessage = getDemoWorkflowPreFlightMessage();
            return [...updated, workflowMessage];
          });
          return;
        }
        
        // Handle step 1 user message
        if (trimmedContent.includes("ok i'm done") && trimmedContent.includes("right thing")) {
          const userMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "user",
            content: content.trim(),
            timestamp: new Date(),
            workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
            relatedStepIndex: 0,
          };
          setMessages((prev) => [...prev, userMessage]);
          
          // Add assistant response after a short delay
          setTimeout(() => {
            const assistantMessage: Message = {
              id: `msg-${Date.now()}`,
              role: "assistant",
              content: "Yes I can see the dmg file in your Finder. We're good to move on to the next step!",
              timestamp: new Date(),
              workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
              relatedStepIndex: 0,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }, 500);
          return;
        }
        
        // Handle step 2 user message
        if (trimmedContent.includes("ok i'm done") && trimmedContent.includes("open the app")) {
          const userMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "user",
            content: content.trim(),
            timestamp: new Date(),
            workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
            relatedStepIndex: 1,
          };
          setMessages((prev) => [...prev, userMessage]);
          
          // Add assistant response after a short delay
          setTimeout(() => {
            const assistantMessage: Message = {
              id: `msg-${Date.now()}`,
              role: "assistant",
              content: "Yes, now that the Mitable app is in your applications folder you should be able to open it without problems",
              timestamp: new Date(),
              workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
              relatedStepIndex: 1,
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }, 500);
          return;
        }
        
        // For other messages in demo mode, don't send to backend
        // Just add the user message and return
        const userMessage: Message = {
          id: `msg-${Date.now()}`,
          role: "user",
          content: content.trim(),
          timestamp: new Date(),
          workflowSessionId: awaitingCustomQuestion?.workflowSessionId || null,
          relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? null,
        };
        setMessages((prev) => [...prev, userMessage]);
        return;
      }

      // Create user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
        // If awaiting custom question, attach workflow fields so message appears in accordion
        workflowSessionId: awaitingCustomQuestion?.workflowSessionId || null,
        relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? null,
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        // Capture screenshot if in watch mode
        let captureResult: MultiWindowCaptureResult | null = null;
        if (selectedWindows.length > 0) {
          console.log("[AgentPanel] Capturing screenshots...");
          captureResult = await window.agentPanelAPI?.captureScreenshot();
          console.log("[AgentPanel] Screenshot capture result:", {
            success: captureResult?.success,
            count: captureResult?.success ? captureResult.screenshots.length : 0,
          });
        }

        // Create conversation if not exists
        let activeConversationId = conversationId;
        if (!activeConversationId) {
          console.log("[AgentPanel] Creating new conversation...");
          const conversation = await createConversation("Agent Panel Conversation");
          activeConversationId = conversation.id;
          setConversationId(activeConversationId);
          console.log("[AgentPanel] Conversation created:", activeConversationId);
        }

        // Create placeholder for streaming assistant message (like conversation window)
        const streamingMessageId = `streaming-${Date.now()}`;
        streamingMessageIdRef.current = streamingMessageId;

        const assistantMessage: Message = {
          id: streamingMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          // Route into the correct workflow accordion/step immediately for custom questions
          workflowSessionId: awaitingCustomQuestion?.workflowSessionId || null,
          relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? null,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Prepare metadata if this is a custom question during workflow
        const isCustomWorkflowQuestion = !!awaitingCustomQuestion;
        const metadata = isCustomWorkflowQuestion
          ? {
              workflowAction: "custom_question",
              selectedOption: 2,
              workflowSessionId: awaitingCustomQuestion.workflowSessionId,
              currentStepIndex: awaitingCustomQuestion.relatedStepIndex,
            }
          : undefined;

        // Set initial loading state
        if (isCustomWorkflowQuestion) {
          setWorkflowLoadingMessage("Thinking...");
        } else {
          setLoadingMessage("Thinking...");
        }

        // Send message with streaming
        await sendMessageStream(activeConversationId, content.trim(), captureResult, {
          onChunk: (chunk, workflowSessionId, relatedStepIndex) => {
            // Clear loading message on first chunk
            if (isCustomWorkflowQuestion) {
              setWorkflowLoadingMessage(null);
            } else {
              setLoadingMessage(null);
            }
            // Update message in-place (like conversation window)
            setMessages((prev) =>
              prev.map((msg): Message =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      content: msg.content + chunk,
                      // Add workflow routing metadata from first chunk
                      workflowSessionId: msg.workflowSessionId ?? workflowSessionId ?? null,
                      relatedStepIndex: msg.relatedStepIndex ?? relatedStepIndex ?? null,
                    }
                  : msg
              )
            );
          },
          onComplete: (fullContent, messageId, messageType, cardData, workflowSessionId, relatedStepIndex) => {
            // Clear loading message on complete (in case onChunk never fired)
            if (isCustomWorkflowQuestion) {
              setWorkflowLoadingMessage(null);
            } else {
              setLoadingMessage(null);
            }

            // Update message in-place (not create new one)
            setMessages((prev) =>
              prev.map((msg): Message =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      id: messageId || msg.id,
                      content: fullContent && fullContent.trim().length > 0 ? fullContent : msg.content,
                      messageType: messageType as "text" | "workflow" | "experts",
                      cardData,
                      // Preserve existing routing if backend omits these fields
                      workflowSessionId: workflowSessionId ?? msg.workflowSessionId,
                      relatedStepIndex: relatedStepIndex ?? msg.relatedStepIndex,
                    }
                  : msg
              )
            );
            streamingMessageIdRef.current = null;
            // Clear awaiting custom question state after successful completion
            if (awaitingCustomQuestion) {
              setAwaitingCustomQuestion(null);
            }
          },
          onError: (error) => {
            console.error("[AgentPanel] Stream error:", error);
            // Clear loading message on error
            if (isCustomWorkflowQuestion) {
              setWorkflowLoadingMessage(null);
            } else {
              setLoadingMessage(null);
            }
            // Update message in-place with error
            setMessages((prev) =>
              prev.map((msg): Message =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      content: `Sorry, I encountered an error: ${error}`,
                    }
                  : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onProgress: (phase, progressMessage) => {
            console.log("[AgentPanel] Progress:", phase, progressMessage);
            if (isCustomWorkflowQuestion) {
              setWorkflowLoadingMessage(progressMessage);
            } else {
              setLoadingMessage(progressMessage);
            }
          },
        }, metadata);
      } catch (error) {
        console.error("[AgentPanel] Error sending message:", error);
        // Update message in-place with error
        const currentStreamingId = streamingMessageIdRef.current;
        if (currentStreamingId) {
          setMessages((prev) =>
            prev.map((msg): Message =>
              msg.id === currentStreamingId
                ? {
                    ...msg,
                    content: `Sorry, I couldn't process your request. Please try again.`,
                  }
                : msg
            )
          );
        }
        streamingMessageIdRef.current = null;
        setLoadingMessage(null);
        setWorkflowLoadingMessage(null);
      }
    },
    [conversationId, selectedWindows.length, awaitingCustomQuestion, demoModeActive, messages.length]
  );

  const handleToggleWatchMode = async () => {
    try {
      const newState = !watchingScreen;
      await window.agentPanelAPI?.toggleWatchMode(newState);
      setWatchingScreen(newState);
    } catch (error) {
      console.error("Failed to toggle watch mode:", error);
    }
  };

  const handleNewChat = () => {
    if (DEMO_MODE) {
      // Reset demo state
      setDemoModeActive(false);
      setMessages([]);
      setConversationId(null);
    } else {
      setConversationId(null);
      setMessages([]);
    }
    streamingMessageIdRef.current = null;
    setLoadingMessage(null);
    setWorkflowLoadingMessage(null);
    setAwaitingCustomQuestion(null);
    setCurrentView("chat"); // Return to chat view
  };

  const handleOpenChats = () => {
    setCurrentView("chats-list");
  };

  const handleSelectConversation = async (id: string) => {
    console.log("[AgentPanel] Selecting conversation:", id);
    setConversationId(id);
    setCurrentView("chat");

    // Fetch messages for selected conversation
    try {
      const existingMessages = await getConversationMessages(id);
      setMessages(
        existingMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: new Date(),
          messageType: msg.messageType as "text" | "workflow" | "experts",
          cardData: msg.cardData,
          workflowSessionId: msg.workflowSessionId,
          relatedStepIndex: msg.relatedStepIndex,
        }))
      );
    } catch (error) {
      console.error("[AgentPanel] Failed to load conversation:", error);
    }
  };

  const handleOpenInConsole = () => {
    if (conversationId) {
      window.agentPanelAPI?.openInConsole(conversationId);
    }
  };

  const handleClose = () => {
    // Start exit animation and fade out vibrancy simultaneously
    setIsVisible(false);
    window.agentPanelAPI?.vibrancyOff();
    // Wait for animation to complete before hiding window
    setTimeout(() => {
      window.agentPanelAPI?.hide();
    }, ANIMATION_DURATION_MS);
  };

  // Exit workflow handler - pauses the workflow without creating user messages
  const handleExitWorkflow = useCallback(async () => {
    if (!conversationId) return;

    setWorkflowLoadingMessage("cancelling workflow");

    try {
      const updatedWorkflow = await pauseWorkflow(conversationId);

      // Update all messages in workflow session to status: "paused"
      if (updatedWorkflow?.workflowSessionId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.workflowSessionId === updatedWorkflow.workflowSessionId && msg.cardData) {
              return {
                ...msg,
                cardData: {
                  ...(msg.cardData as object),
                  status: "paused",
                },
              };
            }
            return msg;
          })
        );
      }
    } catch (error) {
      console.error("[AgentPanel] Error pausing workflow:", error);
    } finally {
      setWorkflowLoadingMessage(null);
    }
  }, [conversationId]);

  // Workflow option handler (matches conversation window pattern)
  const handleWorkflowOptionSelect = useCallback(
    async (option: { id: number; label: string; action: string }) => {
      // In demo mode, allow workflow actions even without conversationId
      if (!DEMO_MODE && (!conversationId || streamingMessageIdRef.current)) return;
      if (DEMO_MODE && streamingMessageIdRef.current) return;

      const { action, label } = option;

      // DEMO MODE: Simulate workflow progression without API calls
      if (DEMO_MODE) {
        // Handle confirm_start action - simulate loading and update workflow to step 1
        if (action === "confirm_start") {
          console.log("[AgentPanel] Demo mode: Simulating workflow_start");
          
          // Find existing workflow message
          const existingWorkflowMessage = [...messages]
            .reverse()
            .find((m) => m.messageType === "workflow" && m.id === DEMO_WORKFLOW_MESSAGE_ID);
          
          if (!existingWorkflowMessage) {
            console.error("[AgentPanel] Demo mode: No workflow message found for confirm_start");
            return;
          }
          
          // Step 1: Show "Searching knowledge base..." for 2 seconds
          setWorkflowLoadingMessage("Searching knowledge base...");
          
          setTimeout(() => {
            // Step 2: Show "Generating step-by-step guide..." for 2 seconds
            setWorkflowLoadingMessage("Generating step-by-step guide...");
            
            setTimeout(() => {
              // Step 3: Clear loading and update workflow to step 1
              setWorkflowLoadingMessage(null);
              const step1WorkflowMessage = getDemoStep1WorkflowMessage();
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === DEMO_WORKFLOW_MESSAGE_ID ? step1WorkflowMessage : msg
                )
              );
            }, 2000);
          }, 2000);
          
          return;
        }
        
        // Handle progress_step action - advance to next step
        if (action === "progress_step") {
          console.log("[AgentPanel] Demo mode: Simulating progress_step");
          
          // Find the latest workflow message
          const activeWorkflowMessage = [...messages]
            .reverse()
            .find((m) => m.messageType === "workflow" && (m.cardData as { workflowSessionId?: string })?.workflowSessionId === DEMO_WORKFLOW_SESSION_ID);
          
          if (!activeWorkflowMessage) {
            console.error("[AgentPanel] Demo mode: No workflow message found");
            return;
          }
          
          const cardData = activeWorkflowMessage.cardData as {
            currentStepIndex?: number;
            stepList?: Array<{ stepNumber: number; description: string; status: string; guidance?: string }>;
          };
          
          const currentStepIndex = cardData.currentStepIndex ?? -1;
          const nextStepIndex = currentStepIndex + 1;
          
          // Show loading message briefly
          setWorkflowLoadingMessage("progressing to next step");
          
          setTimeout(() => {
            setWorkflowLoadingMessage(null);
            
            // Update workflow message based on next step
            let updatedWorkflowMessage: Message;
            
            if (nextStepIndex === 0) {
              // Moving to step 1
              updatedWorkflowMessage = getDemoStep1WorkflowMessage();
            } else if (nextStepIndex === 1) {
              // Moving to step 2
              updatedWorkflowMessage = getDemoStep2WorkflowMessage();
            } else {
              // Workflow complete (shouldn't happen in demo, but handle gracefully)
              console.log("[AgentPanel] Demo mode: Workflow complete");
              return;
            }
            
            // Replace the old workflow message with the updated one
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === activeWorkflowMessage.id ? updatedWorkflowMessage : msg
              )
            );
          }, 1000);
          
          return;
        }
        
        // Handle custom_question action - enable awaiting mode
        if (action === "custom_question" || action === "ask_questions") {
          console.log("[AgentPanel] Demo mode: Enabling custom question mode");
          setAwaitingCustomQuestion({
            conversationId: DEMO_CONVERSATION_ID,
            workflowSessionId: DEMO_WORKFLOW_SESSION_ID,
            relatedStepIndex: null,
          });
          return;
        }
        
        // For other actions in demo mode, do nothing
        return;
      }

      // Handle exit workflow separately (doesn't create user message)
      if (action === "exit_workflow") {
        await handleExitWorkflow();
        return;
      }

      // Find the LATEST workflow message to get current workflowSessionId and currentStepIndex
      const activeWorkflowMessage = [...messages]
        .reverse()
        .find((m) => m.messageType === "workflow" && (m.cardData as { workflowSessionId?: string })?.workflowSessionId);
      const workflowSessionId = (activeWorkflowMessage?.cardData as { workflowSessionId?: string })?.workflowSessionId || null;
      const currentStepIndex = (activeWorkflowMessage?.cardData as { currentStepIndex?: number })?.currentStepIndex ?? null;

      // Handle custom question - enable awaiting mode without sending message
      if (action === "custom_question" || action === "ask_questions") {
        console.log("[AgentPanel] Enabling custom question mode");
        setAwaitingCustomQuestion({
          conversationId,
          workflowSessionId,
          relatedStepIndex: currentStepIndex,
        });
        // Don't send message yet - wait for user to type their actual question
        return;
      }

      let metadata: Record<string, unknown> = {};
      let message = "";

      // Map workflow actions
      switch (action) {
        case "progress_step":
          metadata = {
            workflowAction: "progress_step",
            selectedOption: 1,
            workflowSessionId,
            currentStepIndex,
          };
          message = "Move on to next step";
          break;
        case "confirm_start":
          metadata = {
            workflowAction: "progress_step",
            selectedOption: 1,
            workflowSessionId,
          };
          message = "Yes, let's get started!";
          break;
        case "resume_workflow":
          metadata = {
            workflowAction: "resume_workflow",
            selectedOption: 1,
            workflowSessionId,
            currentStepIndex,
          };
          message = "Resume workflow";
          break;
        default:
          message = label || action;
      }

      console.log("[AgentPanel] Workflow option selected:", {
        action,
        message,
        metadata,
        workflowSessionId,
        currentStepIndex,
      });

      // Do not create visible user messages for workflow control actions
      // All workflow option clicks should operate silently without adding user bubbles
      // (This matches the conversation window behavior)
      const shouldCreateUserMessage = false;

      if (shouldCreateUserMessage) {
        // Add user message to UI with workflow fields so it appears inside WorkflowAccordion
        const userMsg: Message = {
          id: `msg-${Date.now()}`,
          role: "user",
          content: message,
          timestamp: new Date(),
          workflowSessionId,
          relatedStepIndex: currentStepIndex,
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      // Create placeholder for streaming assistant message
      const streamingMessageId = `streaming-${Date.now()}`;
      streamingMessageIdRef.current = streamingMessageId;

      const assistantMessage: Message = {
        id: streamingMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        // Include workflow routing so the message can be properly grouped/rendered
        workflowSessionId,
        relatedStepIndex: currentStepIndex,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Set workflow-specific loading state
      if (action === "confirm_start") {
        setWorkflowLoadingMessage("starting workflow");
      } else if (action === "progress_step") {
        setWorkflowLoadingMessage("progressing to next step");
      } else if (action === "resume_workflow") {
        setWorkflowLoadingMessage("resuming workflow");
      } else {
        setWorkflowLoadingMessage("Thinking...");
      }

      // Capture screenshot if in watch mode
      let captureResult: MultiWindowCaptureResult | null = null;
      if (
        selectedWindows.length > 0 &&
        ["progress_step", "confirm_start", "resume_workflow"].includes(action)
      ) {
        console.log("[AgentPanel] Capturing screenshot for workflow action...");
        try {
          const result = await window.agentPanelAPI?.captureScreenshot();
          if (result && result.success) {
            console.log("[AgentPanel] Multi-window capture successful", {
              windowCount: result.screenshots.length,
              blockedCount: result.blockedWindows.length,
              totalDetected: result.totalWindowsDetected,
            });
            captureResult = result;
          }
        } catch (error) {
          console.error("[AgentPanel] Screenshot capture failed:", error);
          // Continue without screenshot - backend will handle gracefully
        }
      }

      try {
        // Send with metadata as 5th argument
        await sendMessageStream(
          conversationId,
          message,
          captureResult,
          {
            onChunk: (chunk) => {
              // Clear workflow loading state on first chunk
              setWorkflowLoadingMessage(null);

              // Update message in-place
              setMessages((prev) =>
                prev.map((msg): Message =>
                  msg.id === streamingMessageId ? { ...msg, content: msg.content + chunk } : msg
                )
              );
            },
            onComplete: (fullContent, messageId, messageType, cardData, wfSessionId, relatedStepIndex) => {
              console.log("[AgentPanel] Workflow stream complete:", {
                messageId,
                messageType,
                hasCardData: !!cardData,
                workflowSessionId: wfSessionId,
                relatedStepIndex,
              });

              // Clear workflow loading state on complete (in case onChunk never fired)
              setWorkflowLoadingMessage(null);

              // Update message in-place
              setMessages((prev) =>
                prev.map((msg): Message =>
                  msg.id === streamingMessageId
                    ? {
                        ...msg,
                        id: messageId || msg.id,
                        content: fullContent && fullContent.trim().length > 0 ? fullContent : msg.content,
                        messageType: messageType as "text" | "workflow" | "experts",
                        cardData,
                        // Preserve existing routing if backend omits these fields
                        workflowSessionId: wfSessionId ?? msg.workflowSessionId,
                        relatedStepIndex: relatedStepIndex ?? msg.relatedStepIndex,
                      }
                    : msg
                )
              );
              streamingMessageIdRef.current = null;
            },
            onError: (error) => {
              console.error("[AgentPanel] Workflow stream error:", error);

              // Clear workflow loading state on error
              setWorkflowLoadingMessage(null);

              // Update message in-place with error
              setMessages((prev) =>
                prev.map((msg): Message =>
                  msg.id === streamingMessageId
                    ? { ...msg, content: `Error: ${error}. Please try again.` }
                    : msg
                )
              );
              streamingMessageIdRef.current = null;
            },
            onProgress: (phase, progressMessage) => {
              console.log("[AgentPanel] Workflow progress:", phase, progressMessage);
              setWorkflowLoadingMessage(progressMessage);
            },
          },
          metadata
        );
      } catch (error) {
        console.error("[AgentPanel] Error in workflow action:", error);
        setWorkflowLoadingMessage(null);

        // Update message in-place with error
        setMessages((prev) =>
          prev.map((msg): Message =>
            msg.id === streamingMessageId
              ? { ...msg, content: `Sorry, I couldn't process that action. Please try again.` }
              : msg
          )
        );
        streamingMessageIdRef.current = null;
      }
    },
    [conversationId, selectedWindows.length, messages, handleExitWorkflow]
  );

  const hasConversation = messages.length > 0;

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key="agent-panel"
          initial={currentAnimation.initial}
          animate={currentAnimation.animate}
          exit={currentAnimation.exit}
          transition={currentAnimation.transition}
          className="flex flex-col h-screen bg-black/20 text-white border-l border-white/10"
        >
          {/* Header */}
          <Header
            onNewChat={handleNewChat}
            onOpenChats={handleOpenChats}
            onOpenInConsole={handleOpenInConsole}
            onClose={handleClose}
            hasConversation={hasConversation}
            showChatsTitle={currentView === "chats-list"}
          />

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {currentView === "chats-list" ? (
              <ChatsListView
                onSelectConversation={handleSelectConversation}
                currentConversationId={conversationId}
              />
            ) : hasConversation ? (
              <ChatView
                messages={messages}
                isStreaming={!!streamingMessageIdRef.current}
                streamingMessageIdRef={streamingMessageIdRef}
                onWorkflowOptionSelect={handleWorkflowOptionSelect}
                workflowLoadingMessage={workflowLoadingMessage}
                loadingMessage={loadingMessage}
                awaitingCustomQuestion={!!awaitingCustomQuestion}
              />
            ) : (
              <EmptyState userName={userName} />
            )}
          </div>

          {/* Input bar - hidden when viewing chats list */}
          {currentView !== "chats-list" && (
            <InputBar
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              isRecording={isRecording}
              onRecordingChange={setIsRecording}
              watchingScreen={watchingScreen}
              onToggleWatch={handleToggleWatchMode}
              selectedWindowCount={selectedWindows.length}
              onSendMessage={handleSendMessage}
              disabled={!!streamingMessageIdRef.current || (DEMO_MODE && !!workflowLoadingMessage)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
