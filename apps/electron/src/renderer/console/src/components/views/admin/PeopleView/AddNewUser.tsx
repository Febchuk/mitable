import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface RoadmapTemplate {
  id: string;
  title: string;
  tasks: number;
  duration: string;
  description: string;
}

const roadmapTemplates: RoadmapTemplate[] = [
  {
    id: "1",
    title: "Engineering Onboarding",
    tasks: 12,
    duration: "2 weeks",
    description: "Technical setup, codebase intro, first PR",
  },
  {
    id: "2",
    title: "Company Onboarding (All Roles)",
    tasks: 8,
    duration: "1 week",
    description: "Company culture, tools, policies, team intros",
  },
  {
    id: "3",
    title: "Frontend Specialization",
    tasks: 8,
    duration: "1 week",
    description: "React architecture, component library, styling patterns",
  },
];

const roles = [
  { value: "engineer", label: "Software Engineer" },
  { value: "designer", label: "Product Designer" },
  { value: "manager", label: "Marketing Manager" },
  { value: "pm", label: "Product Manager" },
];

const managers = [
  { value: "1", label: "Marcus Johnson" },
  { value: "2", label: "David Kim" },
];

export default function AddNewUser() {
  const navigate = useNavigate();
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [welcomeEmail, setWelcomeEmail] = useState(true);
  const [notifyManager, setNotifyManager] = useState(false);
  const [date, setDate] = useState<Date>();
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [manager, setManager] = useState("");

  const handleTemplateToggle = (templateId: string) => {
    setSelectedTemplates((prev) =>
      prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId]
    );
  };

  const calculateTotals = () => {
    const selected = roadmapTemplates.filter((t) => selectedTemplates.includes(t.id));
    const totalTasks = selected.reduce((sum, t) => sum + t.tasks, 0);
    const totalWeeks = selected.reduce((sum, t) => {
      const weeks = parseInt(t.duration.split(" ")[0]);
      return sum + weeks;
    }, 0);
    return { totalTasks, totalWeeks };
  };

  const { totalTasks, totalWeeks } = calculateTotals();

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to People</span>
        </button>
        <h1 className="text-4xl font-bold text-text-primary">Add New User</h1>
      </div>

      {/* User Info Section */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-text-primary">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder="Enter full name"
              className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-text-primary">
              Email Address <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
            />
            <p className="text-xs text-text-secondary">
              User will receive login credentials at this email
            </p>
          </div>

          {/* Role Combobox */}
          <div className="space-y-2">
            <Label htmlFor="role" className="text-text-primary">
              Role <span className="text-red-500">*</span>
            </Label>
            <Popover open={roleOpen} onOpenChange={setRoleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={roleOpen}
                  className="w-full justify-between bg-background-secondary border-transparent text-text-primary hover:bg-background-secondary hover:text-text-primary"
                >
                  {role
                    ? roles.find((r) => r.value === role)?.label
                    : "Select role"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search role..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No role found.</CommandEmpty>
                    <CommandGroup>
                      {roles.map((r) => (
                        <CommandItem
                          key={r.value}
                          value={r.value}
                          onSelect={(currentValue) => {
                            setRole(currentValue === role ? "" : currentValue);
                            setRoleOpen(false);
                          }}
                        >
                          {r.label}
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4",
                              role === r.value ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Start Date Picker */}
          <div className="space-y-2">
            <Label htmlFor="startDate" className="text-text-primary">
              Start Date <span className="text-red-500">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-background-secondary border-transparent hover:bg-background-secondary hover:text-text-primary",
                    !date && "text-text-secondary"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Manager Combobox */}
        <div className="space-y-2">
          <Label htmlFor="manager" className="text-text-primary">
            Manager
          </Label>
          <Popover open={managerOpen} onOpenChange={setManagerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={managerOpen}
                className="w-full justify-between bg-background-secondary border-transparent text-text-primary hover:bg-background-secondary hover:text-text-primary"
              >
                {manager
                  ? managers.find((m) => m.value === manager)?.label
                  : "Select manager (optional)"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search manager..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No manager found.</CommandEmpty>
                  <CommandGroup>
                    {managers.map((m) => (
                      <CommandItem
                        key={m.value}
                        value={m.value}
                        onSelect={(currentValue) => {
                          setManager(currentValue === manager ? "" : currentValue);
                          setManagerOpen(false);
                        }}
                      >
                        {m.label}
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4",
                            manager === m.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-text-secondary">
            Manager will be notified and can track progress
          </p>
        </div>
      </div>

      {/* Onboarding Roadmap Section */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-1">
            Onboarding Roadmap <span className="text-red-500">*</span>
          </h2>
          <p className="text-sm text-text-secondary">
            Select one or more roadmap templates. They'll be combined into this person's complete
            onboarding plan.
          </p>
        </div>

        <div className="space-y-3">
          {roadmapTemplates.map((template) => (
            <Label
              key={template.id}
              htmlFor={template.id}
              className="flex items-start gap-3 p-4 bg-background-secondary rounded-lg border border-border-subtle hover:bg-background-secondary/80 transition-colors cursor-pointer has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary/5"
            >
              <Checkbox
                id={template.id}
                checked={selectedTemplates.includes(template.id)}
                onCheckedChange={() => handleTemplateToggle(template.id)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-text-primary font-semibold">
                  {template.title}
                </p>
                <p className="text-sm text-primary mt-1">
                  {template.tasks} tasks • {template.duration}
                </p>
                <p className="text-sm text-text-secondary mt-1">{template.description}</p>
              </div>
            </Label>
          ))}
        </div>

        {/* Summary */}
        {selectedTemplates.length > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-primary">
              📋 {selectedTemplates.length} templates selected • {totalTasks} total tasks • ~
              {totalWeeks} weeks duration
            </p>
          </div>
        )}
      </div>

      {/* Additional Settings Section */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Additional Settings</h2>

        <div className="space-y-4">
          {/* Welcome Email */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="welcomeEmail"
              checked={welcomeEmail}
              onCheckedChange={(checked) => setWelcomeEmail(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="welcomeEmail" className="text-text-primary font-medium cursor-pointer">
                Send welcome email on start date
              </Label>
              <p className="text-sm text-text-secondary mt-1">
                Email includes login credentials and first day instructions
              </p>
            </div>
          </div>

          {/* Notify Manager */}
          <div className="flex items-start gap-3">
            <Checkbox
              id="notifyManager"
              checked={notifyManager}
              onCheckedChange={(checked) => setNotifyManager(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="notifyManager" className="text-text-primary font-medium cursor-pointer">
                Notify manager
              </Label>
              <p className="text-sm text-text-secondary mt-1">
                Manager receives progress updates and milestone notifications
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => navigate("/people")}
          className="bg-transparent border-border-subtle text-text-primary hover:bg-background-elevated"
        >
          Cancel
        </Button>
        <Button className="bg-primary text-white hover:bg-primary/90">
          + Add New Hire
        </Button>
      </div>
    </div>
  );
}
