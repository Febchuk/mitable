/**
 * GenerateDocDialog
 *
 * Dialog for generating a new document from a monitoring session.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessions } from "@/console/src/hooks/queries/monitoring";
import { useGenerateDocument } from "@/console/src/hooks/queries/documents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, BookOpen, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DocType } from "@mitable/shared";

interface GenerateDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DOC_TYPE_OPTIONS: Array<{ value: DocType; label: string; description: string; icon: any }> = [
  {
    value: "how-to",
    label: "How-To Guide",
    description: "Step-by-step instructions for completing a task",
    icon: BookOpen,
  },
  {
    value: "knowledge-article",
    label: "Knowledge Article",
    description: "Reference documentation explaining concepts",
    icon: FileText,
  },
  {
    value: "troubleshooting",
    label: "Troubleshooting Guide",
    description: "Problem → Solution guide for issues",
    icon: AlertCircle,
  },
];

export default function GenerateDocDialog({ open, onOpenChange }: GenerateDocDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: sessions = [] } = useSessions();
  const generateMutation = useGenerateDocument();

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<DocType>("how-to");
  const [customTitle, setCustomTitle] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  // Filter sessions that are completed (ready or delivered)
  const completedSessions = sessions.filter(
    (s) => s.status === "ready" || s.status === "delivered"
  );

  const handleGenerate = async () => {
    if (!selectedSessionId) {
      toast({
        title: "Select a session",
        description: "Please select a session to generate documentation from.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        sessionId: selectedSessionId,
        docType: selectedDocType,
        title: customTitle || undefined,
        additionalContext: additionalContext || undefined,
      });

      toast({
        title: "Document generated",
        description: "Your document has been created successfully.",
      });

      onOpenChange(false);
      navigate(`/docs/${result.document.id}`);
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate document.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setSelectedSessionId("");
    setSelectedDocType("how-to");
    setCustomTitle("");
    setAdditionalContext("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-background-primary border-border-subtle sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <Sparkles className="text-primary" size={20} />
            Generate Document from Session
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            AI will analyze your work session and generate documentation based on your activities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Session Selector */}
          <div className="space-y-2">
            <Label className="text-text-primary">Source Session</Label>
            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
              <SelectTrigger className="bg-background-elevated border-border-subtle">
                <SelectValue placeholder="Select a completed session" />
              </SelectTrigger>
              <SelectContent>
                {completedSessions.length === 0 ? (
                  <div className="p-4 text-center text-text-secondary text-sm">
                    No completed sessions available
                  </div>
                ) : (
                  completedSessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      <div className="flex flex-col">
                        <span>{session.name || "Work Session"}</span>
                        <span className="text-xs text-text-secondary">
                          {new Date(session.startedAt).toLocaleDateString()} •{" "}
                          {session.duration?.formatted}
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Doc Type Selector */}
          <div className="space-y-2">
            <Label className="text-text-primary">Document Type</Label>
            <div className="grid grid-cols-1 gap-2">
              {DOC_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedDocType === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedDocType(option.value)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border-subtle bg-background-elevated hover:border-primary/50"
                    }`}
                  >
                    <Icon
                      size={20}
                      className={isSelected ? "text-primary" : "text-text-secondary"}
                    />
                    <div>
                      <div
                        className={isSelected ? "text-primary font-medium" : "text-text-primary"}
                      >
                        {option.label}
                      </div>
                      <div className="text-xs text-text-secondary">{option.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Title (Optional) */}
          <div className="space-y-2">
            <Label className="text-text-primary">
              Custom Title <span className="text-text-secondary">(optional)</span>
            </Label>
            <Input
              placeholder="Leave empty for AI-generated title"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="bg-background-elevated border-border-subtle"
            />
          </div>

          {/* Additional Context (Optional) */}
          <div className="space-y-2">
            <Label className="text-text-primary">
              Additional Context <span className="text-text-secondary">(optional)</span>
            </Label>
            <Textarea
              placeholder="Any specific focus areas or details you want included..."
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              className="bg-background-elevated border-border-subtle min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!selectedSessionId || generateMutation.isPending}
            className="bg-primary text-white hover:bg-primary/90 gap-2"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Document
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
