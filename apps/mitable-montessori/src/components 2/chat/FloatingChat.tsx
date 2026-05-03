"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatThread } from "@/components/chat/ChatThread";

export interface FloatingChatProps {
  classroomId: string;
  schoolId: string;
  userId: string;
}

export function FloatingChat(props: FloatingChatProps) {
  // One thread per session for now; later this can persist across sessions.
  const [threadId] = useState(() => `thread-${crypto.randomUUID()}`);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
          aria-label="Open quick capture chat"
        >
          <MessageSquarePlus className="h-5 w-5" />
          Capture
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-ink/10 p-4">
          <SheetTitle className="font-display">Quick capture</SheetTitle>
          <p className="text-xs text-ink/50">
            Names stay on this device. The model only sees tokens like [STUDENT_1].
          </p>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          <ChatThread
            threadId={threadId}
            classroomId={props.classroomId}
            schoolId={props.schoolId}
            userId={props.userId}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
