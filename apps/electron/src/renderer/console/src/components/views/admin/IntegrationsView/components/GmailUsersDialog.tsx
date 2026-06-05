/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  fetchGmailConnectedUsers,
  type GmailConnectedUser,
} from "@/console/src/services/adminService";
import { Loader2 } from "lucide-react";
import { SiGmail } from "react-icons/si";
import { getLocale } from "@/console/src/lib/date";

interface GmailUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GmailUsersDialog({ open, onOpenChange }: GmailUsersDialogProps) {
  const [users, setUsers] = useState<GmailConnectedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGmailConnectedUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (date?: Date) => {
    if (!date) return "Unknown";
    return new Date(date).toLocaleDateString(getLocale(), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background-elevated border-border-subtle">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <SiGmail className="w-5 h-5 text-[#EA4335]" />
            Gmail Connected Users
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">{error}</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No users have connected their Gmail account yet.</p>
              <p className="text-sm mt-2">
                Users can connect Gmail from their settings to send session summaries.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {users.length} user{users.length !== 1 ? "s" : ""} connected
              </p>
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-background-elevated"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                    <AvatarFallback className="bg-[#EA4335] text-white text-sm">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{user.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.gmailEmail || user.email}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Connected {formatDate(user.connectedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
