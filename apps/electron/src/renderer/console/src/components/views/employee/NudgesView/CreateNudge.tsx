import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateNudge } from "@/console/src/hooks/queries/nudges";
import { useToast } from "@/hooks/use-toast";
import {
  NudgeResource,
  generateNudgeContext,
  generateNudgeQuestion,
} from "@/console/src/services/nudgesService";
import PeopleSelector from "./PeopleSelector";
import ResourceUploader from "./ResourceUploader";

// Type definitions
interface ExpertData {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  expertise: string[];
}

interface CreateNudgeData {
  expert?: ExpertData;
  context?: string;
  conversationId?: string;
}

export default function CreateNudge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { mutate: createNudge, isPending } = useCreateNudge();
  const [selectedPeople, setSelectedPeople] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);
  const [context, setContext] = useState("");
  const [question, setQuestion] = useState("");
  const [resources, setResources] = useState<NudgeResource[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);

  // Pre-populate form from location state (passed from ConsoleLayout via IPC)
  useEffect(() => {
    if (location.state) {
      const nudgeData = location.state as CreateNudgeData;
      console.log("[CreateNudge] Received data from location state:", nudgeData);

      // Store conversationId for context generation
      if (nudgeData.conversationId) {
        setConversationId(nudgeData.conversationId);
        console.log("[CreateNudge] Stored conversationId:", nudgeData.conversationId);
      }

      // Pre-populate expert if provided
      if (nudgeData.expert) {
        setSelectedPeople([
          {
            id: nudgeData.expert.id,
            name: nudgeData.expert.name,
            role: nudgeData.expert.role,
          },
        ]);
      }

      // Pre-populate context if provided
      if (nudgeData.context) {
        setContext(nudgeData.context);
      }
    }
  }, [location.state]);

  const handleAddPerson = (person: { id: string; name: string; role: string }) => {
    // Prevent duplicates
    if (!selectedPeople.some((p) => p.id === person.id)) {
      setSelectedPeople([...selectedPeople, person]);
    }
  };

  const handleRemovePerson = (personId: string) => {
    setSelectedPeople(selectedPeople.filter((p) => p.id !== personId));
  };

  const handleGenerateContext = async () => {
    if (!conversationId) {
      toast({
        title: "No conversation found",
        description: "Start a conversation in the agent window first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingContext(true);
    try {
      const response = await generateNudgeContext(conversationId);
      setContext(response.context);
      toast({
        title: "Context generated",
        description: "You can edit the generated context before sending",
      });
    } catch (error) {
      toast({
        title: "Failed to generate context",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingContext(false);
    }
  };

  const handleGenerateQuestion = async () => {
    if (!conversationId) {
      toast({
        title: "No conversation found",
        description: "Start a conversation in the agent window first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingQuestion(true);
    try {
      const response = await generateNudgeQuestion(conversationId);
      setQuestion(response.question);
      toast({
        title: "Question generated",
        description: "You can edit the generated question before sending",
      });
    } catch (error) {
      toast({
        title: "Failed to generate question",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  const handleSaveDraft = () => {
    createNudge(
      {
        recipientIds: selectedPeople.map((p) => p.id),
        context: context.trim(),
        question: question.trim() || undefined,
        isDraft: true,
        resources: resources.length > 0 ? resources : undefined,
      },
      {
        onSuccess: (response) => {
          toast({
            title: "Draft saved",
            description: response.message,
          });
          navigate("/nudges");
        },
        onError: (error) => {
          toast({
            title: "Error saving draft",
            description: error instanceof Error ? error.message : "Failed to save draft",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSendNudge = () => {
    createNudge(
      {
        recipientIds: selectedPeople.map((p) => p.id),
        context: context.trim(),
        question: question.trim() || undefined,
        isDraft: false,
        resources: resources.length > 0 ? resources : undefined,
      },
      {
        onSuccess: (response) => {
          toast({
            title: "Nudge sent",
            description: response.message,
          });
          navigate("/nudges");
        },
        onError: (error) => {
          toast({
            title: "Error sending nudge",
            description: error instanceof Error ? error.message : "Failed to send nudge",
            variant: "destructive",
          });
        },
      }
    );
  };

  const isFormValid = selectedPeople.length > 0 && context.trim().length > 0;

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/nudges")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Nudges</span>
        </button>
        <h1 className="text-4xl font-bold text-text-primary">Create New Nudge</h1>
      </div>

      {/* Form Sections */}
      <div className="space-y-6">
        {/* Section 1: Select People */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Select People</h2>

          {/* Selected People Display */}
          {selectedPeople.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Selected:</p>
              <div className="flex flex-wrap gap-2">
                {selectedPeople.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center gap-2 bg-background-secondary px-3 py-2 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-text-primary">{person.name}</p>
                      <p className="text-xs text-text-secondary">{person.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemovePerson(person.id)}
                      className="text-text-secondary hover:text-text-primary"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* People Selector */}
          <PeopleSelector selectedPeople={selectedPeople} onAddPerson={handleAddPerson} />
        </div>

        {/* Section 2: Context */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-xl font-semibold text-text-primary">
                Context <span className="text-status-error">*</span>
              </label>
              <p className="text-sm text-text-secondary">
                Describe what you need help with. This will be shared with the selected people.
              </p>
            </div>
            {conversationId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateContext}
                disabled={isGeneratingContext}
                className="shrink-0"
              >
                {isGeneratingContext ? "Generating..." : "✨ Generate"}
              </Button>
            )}
          </div>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="E.g., I'm trying to set up the billing integration and need guidance on the OAuth flow..."
            className="w-full min-h-[150px] bg-background-secondary text-text-primary placeholder-text-tertiary px-4 py-3 rounded-lg border border-border-subtle outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-y"
            maxLength={2000}
          />
          <p className="text-xs text-text-secondary text-right">
            {context.length} / 2000 characters
          </p>
        </div>

        {/* Section 3: Optional Question */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-xl font-semibold text-text-primary">
                Specific Question (Optional)
              </label>
              <p className="text-sm text-text-secondary">
                Add a specific question if you want to highlight something particular.
              </p>
            </div>
            {conversationId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateQuestion}
                disabled={isGeneratingQuestion}
                className="shrink-0"
              >
                {isGeneratingQuestion ? "Generating..." : "✨ Generate"}
              </Button>
            )}
          </div>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="E.g., How do I handle token refresh in the OAuth flow?"
            className="w-full bg-background-secondary text-text-primary placeholder-text-tertiary px-4 py-3 rounded-lg border border-border-subtle outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>

        {/* Section 4: Resources */}
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Attach Resources (Optional)</h2>
          <ResourceUploader resources={resources} onResourcesChange={setResources} />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button
            variant="secondary"
            onClick={handleSaveDraft}
            disabled={!isFormValid || isPending}
          >
            Save as Draft
          </Button>
          <Button variant="default" onClick={handleSendNudge} disabled={!isFormValid || isPending}>
            {isPending ? "Sending..." : "Send Nudge"}
          </Button>
        </div>

        {/* Validation Message */}
        {!isFormValid && (
          <p className="text-sm text-status-error text-center">
            Please select at least one person and provide context to continue.
          </p>
        )}
      </div>
    </div>
  );
}
