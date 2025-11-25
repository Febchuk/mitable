import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MessageAvatarProps {
  role: "user" | "assistant";
  userName?: string;
}

export default function MessageAvatar({ role, userName = "You" }: MessageAvatarProps) {
  if (role === "assistant") {
    return (
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarFallback className="bg-gradient-purple-blue text-white">
          <Bot size={18} />
        </AvatarFallback>
      </Avatar>
    );
  }

  // User avatar with initials
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar className="h-9 w-9 flex-shrink-0">
      <AvatarFallback className="bg-primary/20 text-primary border border-primary/30">
        {initials || <User size={18} />}
      </AvatarFallback>
    </Avatar>
  );
}
