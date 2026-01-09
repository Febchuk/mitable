/**
 * UploadView
 *
 * Upload artifacts (files or pasted text) to be used as context for document generation.
 * Supports two upload methods:
 * - File upload via UploadThing (PDF, DOCX, etc.)
 * - Text paste (saves as markdown artifact)
 */

import { useState } from "react";
import { Upload, FileText, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useUploadFile } from "@/hooks/use-upload-file";
import { useToast } from "@/hooks/use-toast";
import { useArtifacts, useCreateArtifact, useDeleteArtifact } from "@/console/src/hooks/queries/artifacts";

export default function UploadView() {
    const { toast } = useToast();
    const [textTitle, setTextTitle] = useState("");
    const [textContent, setTextContent] = useState("");

    const { data, isLoading } = useArtifacts();
    const artifacts = data?.artifacts || [];

    const createArtifactMutation = useCreateArtifact();
    const deleteArtifactMutation = useDeleteArtifact();

    const { uploadFile, isUploading, progress } = useUploadFile({
        onUploadComplete: async (file) => {
            createArtifactMutation.mutate(
                {
                    title: file.name,
                    type: "file",
                    url: file.url,
                    fileType: file.type,
                    size: file.size,
                },
                {
                    onSuccess: () => {
                        toast({
                            title: "File uploaded",
                            description: `${file.name} has been added to your knowledge sources.`,
                        });
                    },
                    onError: (error) => {
                        console.error("Error saving artifact:", error);
                        toast({
                            title: "Upload failed",
                            description: "Failed to save file information.",
                            variant: "destructive",
                        });
                    },
                }
            );
        },
        onUploadError: (error) => {
            console.error("Upload error:", error);
            toast({
                title: "Upload failed",
                description: "Failed to upload file. Please try again.",
                variant: "destructive",
            });
        },
    });

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        await uploadFile(file);

        // Reset input
        e.target.value = "";
    };

    const handleTextSubmit = () => {
        if (!textTitle.trim() || !textContent.trim()) {
            toast({
                title: "Missing information",
                description: "Please provide both a title and content.",
                variant: "destructive",
            });
            return;
        }

        createArtifactMutation.mutate(
            {
                title: textTitle.trim(),
                type: "text",
                content: textContent.trim(),
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Text saved",
                        description: "Your text has been added to your knowledge sources.",
                    });
                    // Reset form
                    setTextTitle("");
                    setTextContent("");
                },
                onError: (error) => {
                    console.error("Error saving text artifact:", error);
                    toast({
                        title: "Save failed",
                        description: "Failed to save text. Please try again.",
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleDelete = (id: string, title: string) => {
        deleteArtifactMutation.mutate(id, {
            onSuccess: () => {
                toast({
                    title: "Artifact deleted",
                    description: `${title} has been removed.`,
                });
            },
            onError: (error) => {
                console.error("Error deleting artifact:", error);
                toast({
                    title: "Delete failed",
                    description: "Failed to delete artifact. Please try again.",
                    variant: "destructive",
                });
            },
        });
    };

    const formatFileSize = (bytes: number | null) => {
        if (!bytes) return "Unknown size";
        const mb = bytes / (1024 * 1024);
        if (mb < 1) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${mb.toFixed(1)} MB`;
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    };

    const isSubmittingText = createArtifactMutation.isPending;

    return (
        <div className="p-8 space-y-6 app-no-drag">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-bold text-text-primary">Upload Knowledge</h1>
                <p className="text-text-secondary mt-2">
                    Add files or text to provide context for AI document generation
                </p>
            </div>

            {/* Upload Section */}
            <Card className="p-6">
                <Tabs defaultValue="file" className="w-full">
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                        <TabsTrigger value="file">Upload File</TabsTrigger>
                        <TabsTrigger value="text">Paste Text</TabsTrigger>
                    </TabsList>

                    {/* File Upload Tab */}
                    <TabsContent value="file" className="space-y-4">
                        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                            <Upload className="mx-auto h-12 w-12 text-text-tertiary mb-4" />
                            <h3 className="text-lg font-medium text-text-primary mb-2">Upload a file</h3>
                            <p className="text-text-secondary mb-4">PDF, DOCX, TXT, MD, or other text files</p>
                            <label htmlFor="file-upload">
                                <Button disabled={isUploading} className="gap-2" asChild>
                                    <span>
                                        <Plus size={18} />
                                        {isUploading ? "Uploading..." : "Select File"}
                                    </span>
                                </Button>
                            </label>
                            <input
                                id="file-upload"
                                type="file"
                                className="hidden"
                                onChange={handleFileSelect}
                                accept=".pdf,.docx,.doc,.txt,.md,.markdown"
                                disabled={isUploading}
                            />
                            {isUploading && (
                                <div className="mt-4">
                                    <div className="w-full max-w-xs mx-auto bg-background-tertiary rounded-full h-2">
                                        <div
                                            className="bg-primary h-2 rounded-full transition-all"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <p className="text-sm text-text-secondary mt-2">{progress}%</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    {/* Text Paste Tab */}
                    <TabsContent value="text" className="space-y-4">
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-text-primary mb-2 block">Title</label>
                                <Input
                                    placeholder="e.g., Meeting Notes - Jan 2026"
                                    value={textTitle}
                                    onChange={(e) => setTextTitle(e.target.value)}
                                    disabled={isSubmittingText}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-text-primary mb-2 block">Content</label>
                                <Textarea
                                    placeholder="Paste your text here..."
                                    rows={12}
                                    value={textContent}
                                    onChange={(e) => setTextContent(e.target.value)}
                                    disabled={isSubmittingText}
                                    className="resize-none"
                                />
                            </div>
                            <Button
                                onClick={handleTextSubmit}
                                disabled={isSubmittingText || !textTitle.trim() || !textContent.trim()}
                                className="gap-2"
                            >
                                <Plus size={18} />
                                {isSubmittingText ? "Saving..." : "Save Text"}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </Card>

            {/* Artifacts List */}
            <div>
                <h2 className="text-2xl font-semibold text-text-primary mb-4">Your Knowledge Sources</h2>

                {isLoading ? (
                    <div className="text-center py-12 text-text-secondary">Loading artifacts...</div>
                ) : artifacts.length === 0 ? (
                    <Card className="p-12 text-center">
                        <FileText className="mx-auto h-12 w-12 text-text-tertiary mb-4" />
                        <h3 className="text-lg font-medium text-text-primary mb-2">No knowledge sources yet</h3>
                        <p className="text-text-secondary">Upload files or paste text to get started</p>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {artifacts.map((artifact) => (
                            <Card key={artifact.id} className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="mt-1">
                                            {artifact.type === "file" ? (
                                                <Upload className="h-5 w-5 text-text-tertiary" />
                                            ) : (
                                                <FileText className="h-5 w-5 text-text-tertiary" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-text-primary truncate">{artifact.title}</h3>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                                                <span className="capitalize">{artifact.type}</span>
                                                {artifact.type === "file" && artifact.fileType && (
                                                    <span>{artifact.fileType}</span>
                                                )}
                                                {artifact.type === "file" && artifact.size !== null && (
                                                    <span>{formatFileSize(Number(artifact.size))}</span>
                                                )}
                                                <span>{formatDate(artifact.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(artifact.id, artifact.title)}
                                        disabled={deleteArtifactMutation.isPending}
                                        className="gap-2 text-status-error hover:text-status-error hover:bg-status-error/10"
                                    >
                                        <Trash2 size={16} />
                                        Delete
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
