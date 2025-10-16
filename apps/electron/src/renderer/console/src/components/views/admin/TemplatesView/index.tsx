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
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Template } from "../../../../types";

interface MockTemplate extends Omit<Template, "icon"> {
  icon: LucideIcon;
}

const mockTemplates: MockTemplate[] = [
  {
    id: "1",
    organizationId: "org-1",
    title: "Engineering Onboarding",
    tasks: 12,
    usedCount: 8,
    totalWeeks: 4,
    description: "Complete technical setup, codebase introduction, and first feature deployment",
    icon: Settings,
    roleTags: ["Software Engineer", "Frontend"],
  },
  {
    id: "2",
    organizationId: "org-1",
    title: "Design Onboarding",
    tasks: 10,
    usedCount: 3,
    totalWeeks: 3,
    description: "Figma setup, design system review, and first design critique",
    icon: Palette,
    roleTags: ["Product Designer", "UI/UX"],
  },
  {
    id: "3",
    organizationId: "org-1",
    title: "Marketing Onboarding",
    tasks: 9,
    usedCount: 5,
    totalWeeks: 3,
    description: "Marketing tools setup, brand guidelines review, first campaign",
    icon: Megaphone,
    roleTags: ["Marketing Manager"],
  },
  {
    id: "4",
    organizationId: "org-1",
    title: "Sales Onboarding",
    tasks: 11,
    usedCount: 6,
    totalWeeks: 4,
    description: "CRM training, sales process overview, shadow calls",
    icon: Phone,
    roleTags: ["Sales Representative"],
  },
  {
    id: "5",
    organizationId: "org-1",
    title: "Customer Success Onboarding",
    tasks: 8,
    usedCount: 4,
    totalWeeks: 3,
    description:
      "Support platform training, customer communication best practices, and escalation procedures",
    icon: MessageCircle,
    roleTags: ["Customer Success", "Support"],
  },
  {
    id: "6",
    organizationId: "org-1",
    title: "Product Management Onboarding",
    tasks: 14,
    usedCount: 2,
    totalWeeks: 5,
    description: "Product strategy overview, roadmap planning, stakeholder management essentials",
    icon: Building,
    roleTags: ["Product Manager"],
  },
];

export default function TemplatesView() {
  const navigate = useNavigate();

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
        {mockTemplates.map((template) => {
          const IconComponent = template.icon;
          return (
            <div
              key={template.id}
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
              <p className="text-text-secondary text-sm leading-relaxed">{template.description}</p>

              {/* Role Tags */}
              <div className="flex flex-wrap gap-2">
                {template.roleTags.map((role, index) => (
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
        })}
      </div>
    </div>
  );
}
