import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Hash, Lock, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { authService } from "@/console/src/services/authService";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members?: number;
}

interface SlackConfigureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export default function SlackConfigureDialog({
  open,
  onOpenChange,
  onSave,
}: SlackConfigureDialogProps) {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvitePrompt, setShowInvitePrompt] = useState(true);

  // Reset to invite prompt when dialog opens
  useEffect(() => {
    if (open) {
      setShowInvitePrompt(true);
    }
  }, [open]);

  // Fetch channels when moving past invite prompt
  useEffect(() => {
    if (open && !showInvitePrompt) {
      fetchChannels();
    }
  }, [open, showInvitePrompt]);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("http://localhost:3000/api/integrations/slack/channels", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch channels");
      }

      const data = await response.json();
      setChannels(data.channels || []);

      // If no channels, show helpful message
      if (data.channels.length === 0) {
        setError(
          "No channels found. Make sure to invite the Mitable bot to channels using /invite @Mitable"
        );
      }
    } catch (err) {
      console.error("Error fetching channels:", err);
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  };

  const handleSelectAll = () => {
    if (selectedChannels.length === channels.length) {
      setSelectedChannels([]);
    } else {
      setSelectedChannels(channels.map((ch) => ch.id));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch("http://localhost:3000/api/integrations/slack/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          selectedChannels,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save configuration");
      }

      console.log("✅ Channel selection saved");
      setSaving(false);

      // Trigger initial sync automatically
      console.log("🔄 Starting initial sync...");
      setSyncing(true);

      try {
        const syncResponse = await fetch("http://localhost:3000/api/integrations/slack/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (syncResponse.ok) {
          const result = await syncResponse.json();
          setSyncing(false);
          onOpenChange(false);
          alert(
            `✅ Initial Sync Complete!\n\n` +
              `Messages Embedded: ${result.messagesEmbedded}\n` +
              `Channels Processed: ${result.channelsProcessed}\n` +
              `Duration: ${(result.duration / 1000).toFixed(2)}s`
          );
        } else {
          throw new Error("Sync request failed");
        }
      } catch (syncError) {
        console.error("Error during initial sync:", syncError);
        setSyncing(false);
        onOpenChange(false);
        alert(`⚠️ Channels saved but sync failed. You can retry using the Sync button.`);
      }

      onSave();
    } catch (err) {
      console.error("Error saving configuration:", err);
      setError(err instanceof Error ? err.message : "Failed to save configuration");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background-elevated border-border-subtle max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl text-text-primary">Configure Slack Channels</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Select which channels you want to sync and embed into your knowledge base.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Invite Prompt Step */}
          {showInvitePrompt ? (
            <div className="space-y-6 py-4">
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Hash size={24} className="text-primary" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold text-lg text-text-primary">
                      First, Invite Mitable to Your Channels
                    </h3>
                    <p className="text-text-secondary text-sm leading-relaxed">
                      Mitable can only access channels it's been invited to. Before selecting
                      channels, you need to invite the @Mitable bot to each channel you want to
                      sync.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-text-primary">How to invite Mitable:</h4>

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="text-text-primary font-medium">Open Slack</p>
                      <p className="text-text-secondary text-sm">
                        Go to any channel you want Mitable to access
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="text-text-primary font-medium">Type the invite command</p>
                      <div className="mt-2 p-3 bg-background-secondary rounded border border-border-subtle">
                        <code className="text-primary font-mono text-sm">/invite @Mitable</code>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="text-text-primary font-medium">Repeat for all channels</p>
                      <p className="text-text-secondary text-sm">
                        Invite Mitable to every channel you want to sync
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  💡 <strong>Tip:</strong> Mitable will only see messages from channels it's been
                  invited to. You can always add more channels later.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-sm text-red-400">{error}</p>
                  {channels.length === 0 && (
                    <Button onClick={fetchChannels} className="mt-3" variant="outline" size="sm">
                      Retry
                    </Button>
                  )}
                </div>
              )}

              {/* Channels List */}
              {!loading && channels.length > 0 && (
                <>
                  {/* Select All */}
                  <div className="flex items-center justify-between p-3 bg-background-secondary rounded-lg">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedChannels.length === channels.length}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm font-medium text-text-primary">
                        Select All ({channels.length} channels)
                      </span>
                    </div>
                    <span className="text-sm text-text-secondary">
                      {selectedChannels.length} selected
                    </span>
                  </div>

                  {/* Channel List */}
                  <div className="space-y-2">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center gap-3 p-3 bg-background-secondary rounded-lg hover:bg-background-secondary/80 transition-colors cursor-pointer"
                        onClick={() => handleToggleChannel(channel.id)}
                      >
                        <Checkbox
                          checked={selectedChannels.includes(channel.id)}
                          onCheckedChange={() => handleToggleChannel(channel.id)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        <div className="flex items-center gap-2 flex-1">
                          {channel.is_private ? (
                            <Lock size={16} className="text-text-tertiary" />
                          ) : (
                            <Hash size={16} className="text-text-tertiary" />
                          )}
                          <span className="text-text-primary font-medium">{channel.name}</span>
                          {channel.is_private && (
                            <span className="text-xs px-2 py-0.5 bg-background-primary rounded text-text-tertiary">
                              Private
                            </span>
                          )}
                        </div>

                        {channel.num_members !== undefined && (
                          <span className="text-xs text-text-tertiary">
                            {channel.num_members} members
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {showInvitePrompt ? (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-text-secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setShowInvitePrompt(false)}
                className="bg-primary hover:bg-primary/90 text-white gap-2"
              >
                Continue to Channel Selection
                <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-text-secondary"
                disabled={saving || syncing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || syncing || selectedChannels.length === 0}
                className="bg-primary hover:bg-primary/90 text-white gap-2"
              >
                {syncing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Syncing messages...
                  </>
                ) : saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Save & Sync ({selectedChannels.length})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
