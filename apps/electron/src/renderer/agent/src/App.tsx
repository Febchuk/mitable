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

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

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
        />
      )}
    </div>
  );
}

export default App;
