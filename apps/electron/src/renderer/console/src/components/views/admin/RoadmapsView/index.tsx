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

interface Roadmap {
  id: string;
  title: string;
  tasks: number;
  usedCount: number;
  description: string;
  icon: LucideIcon;
  roles: string[];
}

const mockRoadmaps: Roadmap[] = [
  {
    id: "1",
    title: "Engineering Onboarding",
    tasks: 12,
    usedCount: 8,
    description: "Complete technical setup, codebase introduction, and first feature deployment",
    icon: Settings,
    roles: ["Software Engineer", "Frontend"],
  },
  {
    id: "2",
    title: "Design Onboarding",
    tasks: 10,
    usedCount: 3,
    description: "Figma setup, design system review, and first design critique",
    icon: Palette,
    roles: ["Product Designer", "UI/UX"],
  },
  {
    id: "3",
    title: "Marketing Onboarding",
    tasks: 9,
    usedCount: 5,
    description: "Marketing tools setup, brand guidelines review, first campaign",
    icon: Megaphone,
    roles: ["Marketing Manager"],
  },
  {
    id: "4",
    title: "Sales Onboarding",
    tasks: 11,
    usedCount: 6,
    description: "CRM training, sales process overview, shadow calls",
    icon: Phone,
    roles: ["Sales Representative"],
  },
  {
    id: "5",
    title: "Customer Success Onboarding",
    tasks: 8,
    usedCount: 4,
    description:
      "Support platform training, customer communication best practices, and escalation procedures",
    icon: MessageCircle,
    roles: ["Customer Success", "Support"],
  },
  {
    id: "6",
    title: "Product Management Onboarding",
    tasks: 14,
    usedCount: 2,
    description: "Product strategy overview, roadmap planning, stakeholder management essentials",
    icon: Building,
    roles: ["Product Manager"],
  },
];

export default function RoadmapsView() {
  const navigate = useNavigate();

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-6">
        <h1 className="text-4xl font-bold text-text-primary">Roadmaps</h1>

        {/* Search and Actions Bar */}
        <div className="flex items-center gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              size={20}
            />
            <Input
              placeholder="Search integrations..."
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

          {/* Add New Roadmap Button */}
          <Button
            className="gap-2 bg-primary text-white hover:bg-primary/90"
            onClick={() => navigate("/roadmaps/new")}
          >
            <Plus size={20} />
            <span>Add New Roadmap</span>
          </Button>
        </div>
      </div>

      {/* Roadmaps Grid */}
      <div className="grid grid-cols-2 gap-6">
        {mockRoadmaps.map((roadmap) => {
          const IconComponent = roadmap.icon;
          return (
            <div
              key={roadmap.id}
              className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4 hover:border-border-subtle/80 transition-colors cursor-pointer"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-full bg-background-secondary flex items-center justify-center">
                <IconComponent size={24} className="text-text-secondary" />
              </div>

              {/* Title and Stats */}
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-text-primary">{roadmap.title}</h3>
                <p className="text-sm text-text-secondary">
                  {roadmap.tasks} tasks • Used {roadmap.usedCount} times
                </p>
              </div>

              {/* Description */}
              <p className="text-text-secondary text-sm leading-relaxed">{roadmap.description}</p>

              {/* Role Tags */}
              <div className="flex flex-wrap gap-2">
                {roadmap.roles.map((role, index) => (
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
