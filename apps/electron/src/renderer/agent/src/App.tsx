import { useState } from "react";
import { Workflow, Users } from "lucide-react";
import AgentPill from "./components/AgentPill";
import ConversationDialog from "./components/ConversationDialog";

declare global {
  interface Window {
    agentAPI: {
      toggle: () => void;
      showConsole: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      resizeWindow: (mode: 'pill' | 'conversation') => void;
      showNudge: (data: any) => void;
      startGuide: (data: any) => void;
    };
  }
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "card";
  cardData?: {
    title: string;
    subtitle: string;
    icon: any;
  };
}

// Mock guide data for Ticket Billing Escalation workflow
const BILLING_ESCALATION_GUIDE = {
  id: "billing-escalation-guide",
  title: "Agent Interactive Workflow",
  description: "Step-by-step guide to escalate a billing ticket",
  steps: [
    {
      id: "step-1",
      stepNumber: 1,
      instruction: "Click the 'Priority' dropdown in the top toolbar.",
      targetElement: {
        label: "Priority Dropdown",
        boundingBox: { x: 100, y: 50, width: 120, height: 40 },
      },
      completed: false,
    },
    {
      id: "step-2",
      stepNumber: 2,
      instruction: "Click the 'Assign' button in the top toolbar.",
      targetElement: {
        label: "Assign Button",
        boundingBox: { x: 250, y: 50, width: 100, height: 40 },
      },
      completed: false,
    },
    {
      id: "step-3",
      stepNumber: 3,
      instruction: "Select 'Billing Team' from the assignment dropdown.",
      targetElement: {
        label: "Team Dropdown",
        boundingBox: { x: 250, y: 100, width: 200, height: 150 },
      },
      completed: false,
    },
    {
      id: "step-4",
      stepNumber: 4,
      instruction: "Add an escalation note in the comments section.",
      targetElement: {
        label: "Comments Field",
        boundingBox: { x: 50, y: 300, width: 400, height: 100 },
      },
      completed: false,
    },
    {
      id: "step-5",
      stepNumber: 5,
      instruction: "Click the 'Notify Team Lead' checkbox.",
      targetElement: {
        label: "Notify Checkbox",
        boundingBox: { x: 50, y: 420, width: 200, height: 30 },
      },
      completed: false,
    },
    {
      id: "step-6",
      stepNumber: 6,
      instruction: "Click 'Save' to complete the escalation.",
      targetElement: {
        label: "Save Button",
        boundingBox: { x: 300, y: 500, width: 100, height: 40 },
      },
      completed: false,
    },
  ],
  currentStep: 0,
  completed: false,
  createdAt: new Date().toISOString(),
};

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleCardClick = () => {
    window.agentAPI.startGuide(BILLING_ESCALATION_GUIDE);
  };

  const handleSubmit = (message: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);

    // Expand to conversation mode
    if (!isExpanded) {
      setIsExpanded(true);
      window.agentAPI.resizeWindow('conversation');
    }

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "You'll need to set the priority to High, then assign it to the Billing Team. The escalation will automatically notify their team lead. Would you like me to show you where those buttons are?",
        type: "text",
      };

      setMessages((prev) => [...prev, aiMessage]);

      // Add example user follow-up
      setTimeout(() => {
        const followUpMessage: Message = {
          id: (Date.now() + 2).toString(),
          role: "user",
          content: "Yes, show me!",
          type: "text",
        };

        setMessages((prev) => [...prev, followUpMessage]);

        // Add interactive card
        setTimeout(() => {
          const cardMessage: Message = {
            id: (Date.now() + 3).toString(),
            role: "assistant",
            content: "",
            type: "card",
            cardData: {
              title: "Ticket Billing Escalation",
              subtitle: "Interactive Workflow",
              icon: Workflow,
            },
          };

          setMessages((prev) => [...prev, cardMessage]);

          // Trigger nudge window with expert recommendations
          setTimeout(() => {
            window.agentAPI.showNudge({
              type: "expert_match",
              title: "Billing Escalation Experts",
              description: "We found experts who can help with billing escalations",
            });
          }, 500);
        }, 1000);
      }, 1500);
    }, 1000);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setMessages([]);
    window.agentAPI.resizeWindow('pill');
  };

  const handleMouseEnter = () => {
    window.agentAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.agentAPI.setIgnoreMouseEvents(true);
  };

  return (
    <div
      className="w-full h-full flex flex-col-reverse items-center gap-4 p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center justify-center">
        <AgentPill onSubmit={handleSubmit} />
      </div>
      {isExpanded && (
        <ConversationDialog
          messages={messages}
          onSubmit={handleSubmit}
          onClose={handleClose}
          onCardClick={handleCardClick}
        />
      )}
    </div>
  );
}

export default App;
