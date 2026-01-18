/**
 * GenerateDocDialog
 *
 * Dialog for generating a new document from monitoring sessions and artifacts.
 * Supports multi-session selection and artifact inclusion for comprehensive documentation.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGenerateDocument } from "@/console/src/hooks/queries/documents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Sparkles,
  BookOpen,
  FileText,
  AlertCircle,
  Activity,
  Paperclip,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MultiSessionSelector from "@/console/src/components/shared/MultiSessionSelector";
import ArtifactSelector from "@/console/src/components/shared/ArtifactSelector";
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

const MERGE_STRATEGIES = [
  {
    value: "chronological",
    label: "Chronological",
    description: "Organize content by time order",
  },
  {
    value: "thematic",
    label: "Thematic",
    description: "Group by topic and theme",
  },
];

export default function GenerateDocDialog({ open, onOpenChange }: GenerateDocDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const generateMutation = useGenerateDocument();

  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<DocType>("how-to");
  const [mergeStrategy, setMergeStrategy] = useState<"chronological" | "thematic">("chronological");
  const [customTitle, setCustomTitle] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const handleGenerate = async () => {
    if (selectedSessionIds.length === 0 && selectedArtifactIds.length === 0) {
      toast({
        title: "Select at least one source",
        description: "Please select sessions or artifacts to generate documentation from.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        sessionIds: selectedSessionIds.length > 0 ? selectedSessionIds : undefined,
        artifactIds: selectedArtifactIds.length > 0 ? selectedArtifactIds : undefined,
        docType: selectedDocType,
        title: customTitle || undefined,
        additionalContext: additionalContext || undefined,
        mergeStrategy: selectedSessionIds.length > 1 ? mergeStrategy : undefined,
      });

      // Build description based on what was selected
      const parts: string[] = [];
      if (selectedSessionIds.length > 0) {
        parts.push(`${selectedSessionIds.length} session${selectedSessionIds.length > 1 ? "s" : ""}`);
      }
      if (selectedArtifactIds.length > 0) {
        parts.push(`${selectedArtifactIds.length} artifact${selectedArtifactIds.length > 1 ? "s" : ""}`);
      }

      toast({
        title: "Document generated",
        description: `Your document has been created from ${parts.join(" and ")}.`,
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
    setSelectedSessionIds([]);
    setSelectedArtifactIds([]);
    setSelectedDocType("how-to");
    setMergeStrategy("chronological");
    setCustomTitle("");
    setAdditionalContext("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-background-primary border-border-subtle sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <Sparkles className="text-primary" size={20} />
            Generate Document
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            AI will analyze your work sessions and artifacts to generate comprehensive documentation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Sources Tabs */}
          <Tabs defaultValue="sessions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sessions" className="gap-2">
                <Activity size={16} />
                Sessions
                {selectedSessionIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                    {selectedSessionIds.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="artifacts" className="gap-2">
                <Paperclip size={16} />
                Artifacts
                {selectedArtifactIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                    {selectedArtifactIds.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sessions" className="mt-4">
              <div className="space-y-2">
                <Label className="text-text-primary">Select Sessions</Label>
                <MultiSessionSelector
                  selectedIds={selectedSessionIds}
                  onChange={setSelectedSessionIds}
                  maxHeight="200px"
                />
              </div>
            </TabsContent>

            <TabsContent value="artifacts" className="mt-4">
              <div className="space-y-2">
                <Label className="text-text-primary">Include Artifacts (Optional)</Label>
                <ArtifactSelector
                  selectedIds={selectedArtifactIds}
                  onChange={setSelectedArtifactIds}
                  maxHeight="200px"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Merge Strategy (only show when multiple sessions selected) */}
          {selectedSessionIds.length > 1 && (
            <div className="space-y-2">
              <Label className="text-text-primary">Merge Strategy</Label>
              <div className="grid grid-cols-2 gap-2">
                {MERGE_STRATEGIES.map((strategy) => {
                  const isSelected = mergeStrategy === strategy.value;
                  return (
                    <button
                      key={strategy.value}
                      onClick={() => setMergeStrategy(strategy.value as "chronological" | "thematic")}
                      className={`flex flex-col p-3 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border-subtle bg-background-elevated hover:border-primary/50"
                      }`}
                    >
                      <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-text-primary"}`}>
                        {strategy.label}
                      </span>
                      <span className="text-xs text-text-secondary">{strategy.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
            disabled={(selectedSessionIds.length === 0 && selectedArtifactIds.length === 0) || generateMutation.isPending}
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
