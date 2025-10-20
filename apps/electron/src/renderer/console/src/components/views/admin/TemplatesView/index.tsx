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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-text-primary">Templates</h1>

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
              className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
            />
          </div>

          {/* Filter Button */}
          <Button
            variant="outline"
            className="gap-2 bg-background-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/80"
          >
            <Filter size={20} />
            <span className="font-medium">Filter</span>
          </Button>

          {/* Create Template Button */}
          <Button
            className="gap-2 bg-primary text-white hover:bg-primary/90"
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
          <div className="col-span-2 text-center text-text-secondary py-12">
            Loading templates...
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
                className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4 hover:border-border-subtle/80 transition-colors cursor-pointer"
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-full bg-background-secondary flex items-center justify-center">
                  <IconComponent size={24} className="text-text-secondary" />
                </div>

                {/* Title and Stats */}
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-text-primary">{template.title}</h3>
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
                      className="bg-background-secondary text-text-secondary border-transparent hover:bg-background-secondary"
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
  );
}
