import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Plus,
  Settings,
  Palette,
  Megaphone,
  Phone,
  MessageCircle,
  Building,
  Bot,
  Lightbulb,
  Users,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTemplates } from "@/console/src/hooks/queries/admin";
import logoIconSvg from "../../../../../../assets/logo-icon.svg";

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  Bot,
  Code: Settings,
  Lightbulb,
  Users,
  TrendingUp,
  Palette,
  Settings,
  Megaphone,
  Phone,
  MessageCircle,
  Building,
};

export default function TemplatesView() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading: loading, error } = useTemplates();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter templates based on search query
  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.toLowerCase();
    return (
      template.title.toLowerCase().includes(query) ||
      template.description?.toLowerCase().includes(query) ||
      template.roleTags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  return (
    <div className="h-screen overflow-y-auto bg-[#0a0810] custom-scrollbar">
      <div className="max-w-7xl mx-auto p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <img src={logoIconSvg} alt="Mitable" className="w-10 h-10" />
          <h1 className="text-4xl font-bold text-white">Templates</h1>
        </div>

        {/* Search and Actions Bar */}
        <div className="flex items-center gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              size={20}
            />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-[#1a1625] border-primary/20 text-white placeholder:text-text-tertiary"
            />
          </div>

          {/* Filter Button */}
          <Button
            variant="outline"
            className="gap-2 bg-[#1a1625] border-primary/20 text-text-secondary hover:text-white hover:bg-[#231d2e]"
          >
            <Filter size={20} />
            <span className="font-medium">Filter</span>
          </Button>

          {/* Create Template Button */}
          <Button
            className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:shadow-glow-purple text-white"
            onClick={() => navigate("/templates/new")}
          >
            <Plus size={20} />
            <span>Create Template</span>
          </Button>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 text-center py-12">
            <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-text-secondary">Loading templates...</p>
          </div>
        ) : error ? (
          <div className="col-span-2 text-center text-status-error py-12">
            Error: {error.message}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="col-span-2 text-center text-text-secondary py-12">
            {searchQuery ? `No templates found matching "${searchQuery}"` : "No templates found"}
          </div>
        ) : (
          filteredTemplates.map((template) => {
            const IconComponent = iconMap[template.icon] || Settings;
            return (
              <div
                key={template.id}
                onClick={() => navigate(`/templates/${template.id}`)}
                className="bg-[#1a1625] rounded-xl border border-primary/20 p-6 space-y-4 hover:border-primary/40 hover:bg-[#231d2e] transition-all cursor-pointer group"
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center group-hover:from-purple-600/30 group-hover:to-blue-600/30 transition-colors">
                  <IconComponent size={24} className="text-purple-400" />
                </div>

                {/* Title and Stats */}
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white group-hover:text-purple-400 transition-colors">{template.title}</h3>
                  <p className="text-sm text-text-secondary">
                    {template.tasks} tasks • Used {template.usedCount} times
                  </p>
                </div>

                {/* Description */}
                <p className="text-text-secondary text-sm leading-relaxed">
                  {template.description}
                </p>

                {/* Role Tags */}
                <div className="flex flex-wrap gap-2">
                  {template.roleTags?.map((role, index) => (
                    <Badge
                      key={index}
                      className="bg-black/30 text-text-secondary border-primary/10"
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>
    </div>
  );
}
