import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../../../context/UserContext";
import { useRoadmap } from "@/console/src/hooks/queries/roadmap";
import { useConversations } from "@/console/src/hooks/queries/chats";
import { useNudges } from "@/console/src/hooks/queries/nudges";
import { 
  Search, 
  MessageSquare, 
  Bell, 
  MapIcon, 
  CheckCircle2, 
  Clock,
  TrendingUp,
  Sparkles
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import logoIconSvg from "../../../../../../assets/logo-icon.svg";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

export default function HomeView() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: roadmapData } = useRoadmap();
  const { data: conversationsData } = useConversations();
  const { data: nudges = [] } = useNudges();

  // Calculate roadmap stats
  const allTasks = roadmapData?.weeks.flatMap((w) => w.tasks) || [];
  const completedTasks = allTasks.filter((t) => t.completed).length;
  const totalTasks = allTasks.length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Get next 3 incomplete tasks
  const upcomingTasks = allTasks.filter((t) => !t.completed).slice(0, 3);
  
  // Recent conversations
  const recentChats = conversationsData?.conversations.slice(0, 3) || [];
  
  // Pending nudges
  const pendingNudges = nudges.filter((n) => n.status !== "resolved");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to chats and start new conversation with this query
      navigate("/chats");
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0a0810] custom-scrollbar">
      <div className="max-w-7xl mx-auto p-8 space-y-8 app-no-drag">
        {/* Hero Section */}
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-4">
            <img src={logoIconSvg} alt="Mitable" className="w-10 h-10" />
            <span className="text-2xl font-bold text-white">Mitable</span>
          </div>
          
          {/* Greeting */}
          <div>
            <h1 className="text-5xl font-bold text-white mb-2">
              {getGreeting()}, {user?.firstName}
            </h1>
            <p className="text-text-secondary text-lg">Here's your progress</p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask me anything..."
              className="w-full bg-[#1a1625] text-white text-base placeholder-text-tertiary pl-12 pr-4 py-4 rounded-xl border border-primary/20 outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            />
          </form>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-6">
          {/* Roadmap Progress */}
          <div className="bg-[#1a1625] border border-primary/20 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <MapIcon size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-text-tertiary text-sm">Roadmap Progress</p>
                  <p className="text-white text-2xl font-bold">{overallProgress}%</p>
                </div>
              </div>
            </div>
            <Progress value={overallProgress} className="h-2 bg-black/40" />
            <p className="text-text-secondary text-xs">
              {completedTasks} of {totalTasks} tasks completed
            </p>
          </div>

          {/* Active Chats */}
          <div 
            onClick={() => navigate("/chats")}
            className="bg-[#1a1625] border border-primary/20 rounded-xl p-6 hover:bg-[#231d2e] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
                <MessageSquare size={20} className="text-white" />
              </div>
              <div>
                <p className="text-text-tertiary text-sm">Conversations</p>
                <p className="text-white text-2xl font-bold">{recentChats.length}</p>
              </div>
            </div>
            <p className="text-text-secondary text-xs">Active chats</p>
          </div>

          {/* Nudges */}
          <div 
            onClick={() => navigate("/nudges")}
            className="bg-[#1a1625] border border-primary/20 rounded-xl p-6 hover:bg-[#231d2e] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-pink-600 rounded-lg flex items-center justify-center">
                <Bell size={20} className="text-white" />
              </div>
              <div>
                <p className="text-text-tertiary text-sm">Pending Nudges</p>
                <p className="text-white text-2xl font-bold">{pendingNudges.length}</p>
              </div>
            </div>
            <p className="text-text-secondary text-xs">Awaiting response</p>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Today's Focus */}
          <div className="bg-[#1a1625] border border-primary/20 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={20} className="text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Today's Focus</h2>
            </div>
            
            {upcomingTasks.length > 0 ? (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate("/roadmap")}
                    className="flex items-start gap-3 p-3 bg-[#0f0d15] rounded-lg hover:bg-black/40 transition-colors cursor-pointer group"
                  >
                    <div className="mt-1">
                      <div className="w-5 h-5 rounded border-2 border-primary/50 group-hover:border-primary transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium line-clamp-2 group-hover:text-purple-400 transition-colors">
                        {task.title}
                      </p>
                      <p className="text-text-tertiary text-xs mt-1">Week {task.week} · {task.timeEstimate}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
                <p className="text-white font-medium">All caught up!</p>
                <p className="text-text-secondary text-sm mt-1">No pending tasks</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-[#1a1625] border border-primary/20 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-blue-400" />
              <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
            </div>
            
            <div className="space-y-3">
              {recentChats.length > 0 ? (
                recentChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => navigate(`/chats`)}
                    className="flex items-start gap-3 p-3 bg-[#0f0d15] rounded-lg hover:bg-black/40 transition-colors cursor-pointer group"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MessageSquare size={16} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium line-clamp-1 group-hover:text-purple-400 transition-colors">
                        {chat.title}
                      </p>
                      <p className="text-text-tertiary text-xs mt-1 line-clamp-1">
                        {chat.lastMessage || "No messages yet"}
                      </p>
                      <p className="text-text-tertiary text-xs mt-1">
                        {formatTimestamp(chat.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Sparkles size={48} className="text-purple-400 mx-auto mb-3" />
                  <p className="text-white font-medium">Start a conversation</p>
                  <p className="text-text-secondary text-sm mt-1">Ask me anything!</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
