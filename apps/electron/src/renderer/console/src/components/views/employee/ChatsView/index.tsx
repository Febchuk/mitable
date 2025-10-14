import { useChats } from "../../../../context/ChatsContext";
import Card from "../../../ui/Card";
import Badge from "../../../ui/Badge";
import { MessageSquare, Clock } from "lucide-react";

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

export default function ChatsView() {
  const { chats, markAsRead } = useChats();

  const unreadCount = chats.filter((c) => c.unread).length;

  return (
    <div className="p-2xl space-y-xl max-w-4xl app-no-drag">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-sm">Conversations</h1>
          <p className="text-text-secondary">Your ongoing help requests and expert connections</p>
        </div>
        {unreadCount > 0 && <Badge variant="info">{unreadCount} unread</Badge>}
      </div>

      {/* Chat List */}
      <div className="space-y-md">
        {chats.map((chat) => (
          <Card
            key={chat.id}
            hover
            onClick={() => markAsRead(chat.id)}
            className={`cursor-pointer ${chat.unread ? "border-primary" : ""}`}
          >
            <div className="flex items-start gap-md">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  chat.unread ? "bg-primary" : "bg-background-elevated"
                }`}
              >
                <MessageSquare
                  size={20}
                  className={chat.unread ? "text-white" : "text-text-tertiary"}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-md mb-xs">
                  <h3
                    className={`text-base font-semibold ${
                      chat.unread ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {chat.title}
                  </h3>
                  <div className="flex items-center gap-xs text-text-tertiary flex-shrink-0">
                    <Clock size={14} />
                    <span className="text-xs">{formatTimestamp(chat.timestamp)}</span>
                  </div>
                </div>

                <p
                  className={`text-sm truncate ${
                    chat.unread ? "text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  {chat.lastMessage}
                </p>
              </div>

              {chat.unread && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {chats.length === 0 && (
        <Card padding="lg">
          <div className="text-center py-2xl">
            <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mx-auto mb-md">
              <MessageSquare size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-sm">No conversations yet</h3>
            <p className="text-sm text-text-secondary">
              Start a conversation with an expert by accepting a nudge or asking for help.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
