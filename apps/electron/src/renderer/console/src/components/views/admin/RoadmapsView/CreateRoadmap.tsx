import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Info, X, Settings, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const availableRoles = [
  "Software Engineer",
  "Frontend",
  "Backend",
  "Product Designer",
  "UI/UX",
  "Marketing Manager",
  "Sales Representative",
  "Customer Success",
  "Support",
  "Product Manager",
  "DevOps",
  "QA Engineer",
];

export default function CreateRoadmap() {
  const navigate = useNavigate();

  // Form state
  const [roadmapName, setRoadmapName] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [roleTags, setRoleTags] = useState<string[]>(["Software Engineer", "Frontend"]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  // AI settings state
  const [autoDetectTasks, setAutoDetectTasks] = useState(true);
  const [setRelativeDates, setSetRelativeDates] = useState(true);
  const [markCritical, setMarkCritical] = useState(false);

  const handleAddRole = (role: string) => {
    if (!roleTags.includes(role)) {
      setRoleTags([...roleTags, role]);
    }
    setTagPopoverOpen(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setRoleTags(roleTags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/roadmaps")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Roadmaps</span>
        </button>
        <h1 className="text-4xl font-bold text-text-primary">Create Roadmap</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="import-notion" className="space-y-6">
        <TabsList className="w-full bg-background-elevated border-border-subtle">
          <TabsTrigger
            value="import-notion"
            className="flex-1 data-[state=active]:bg-background-secondary data-[state=active]:text-white"
          >
            Import from Notion
          </TabsTrigger>
          <TabsTrigger
            value="from-scratch"
            className="flex-1 data-[state=active]:bg-background-secondary data-[state=active]:text-white"
          >
            Start from Scratch
          </TabsTrigger>
          <TabsTrigger
            value="duplicate"
            className="flex-1 data-[state=active]:bg-background-secondary data-[state=active]:text-white"
          >
            Duplicate Existing
          </TabsTrigger>
        </TabsList>

        {/* Import from Notion Tab */}
        <TabsContent value="import-notion" className="space-y-6">
          {/* Import from Notion Form */}
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-6">
            <h2 className="text-xl font-semibold text-text-primary">Import from Notion</h2>

            {/* Roadmap Name */}
            <div className="space-y-2">
              <Label htmlFor="roadmapName" className="text-text-primary">
                Roadmap Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="roadmapName"
                placeholder="e.g. Engineering Onboarding"
                value={roadmapName}
                onChange={(e) => setRoadmapName(e.target.value)}
                className="bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
              />
            </div>

            {/* Icon Selection */}
            <div className="space-y-2">
              <Label className="text-text-primary">Icon Selection</Label>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-background-secondary flex items-center justify-center">
                  <Settings size={24} className="text-text-secondary" />
                </div>
                <Button
                  variant="outline"
                  className="bg-background-secondary border-transparent text-text-secondary hover:bg-background-secondary/80"
                >
                  Choose Icon
                </Button>
              </div>
              <p className="text-xs text-text-secondary">
                This icon will be displayed on the roadmap card
              </p>
            </div>

            {/* Notion Page URL */}
            <div className="space-y-2">
              <Label htmlFor="notionUrl" className="text-text-primary">
                Notion Page URL <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded flex items-center justify-center">
                  <span className="text-xs font-bold text-black">N</span>
                </div>
                <Input
                  id="notionUrl"
                  placeholder="Paste Notion page link here..."
                  value={notionUrl}
                  onChange={(e) => setNotionUrl(e.target.value)}
                  className="pl-12 bg-background-secondary border-transparent text-text-primary placeholder:text-text-secondary"
                />
              </div>
              <p className="text-xs text-text-secondary">
                We'll parse your Notion page and convert it into a roadmap template
              </p>
            </div>

            {/* Role Tags */}
            <div className="space-y-2">
              <Label className="text-text-primary">Role Tags</Label>
              <div className="flex flex-wrap gap-2 p-3 bg-background-secondary rounded-lg border border-transparent">
                {roleTags.map((tag) => (
                  <Badge
                    key={tag}
                    className="bg-background-secondary text-text-primary border-border-subtle hover:bg-background-secondary pl-3 pr-1 py-1 gap-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:bg-background-elevated rounded-sm p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto py-1 px-2 text-text-secondary hover:text-text-primary hover:bg-transparent"
                    >
                      + Add role tags...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search roles..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No role found.</CommandEmpty>
                        <CommandGroup>
                          {availableRoles
                            .filter((role) => !roleTags.includes(role))
                            .map((role) => (
                              <CommandItem
                                key={role}
                                value={role}
                                onSelect={() => handleAddRole(role)}
                              >
                                {role}
                                <Check
                                  className={cn(
                                    "ml-auto h-4 w-4",
                                    roleTags.includes(role) ? "opacity-100" : "opacity-0"
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
              <p className="text-xs text-text-secondary">Tags help organize and filter roadmaps</p>
            </div>
          </div>

          {/* AI Generation Settings */}
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
            <h2 className="text-xl font-semibold text-text-primary">AI Generation Settings</h2>

            <div className="space-y-4">
              {/* Auto detect task types */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="autoDetect"
                  checked={autoDetectTasks}
                  onCheckedChange={(checked) => setAutoDetectTasks(checked as boolean)}
                />
                <Label
                  htmlFor="autoDetect"
                  className="text-text-primary font-normal cursor-pointer"
                >
                  Automatically detect task types
                </Label>
              </div>

              {/* Set relative due dates */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="relativeDates"
                  checked={setRelativeDates}
                  onCheckedChange={(checked) => setSetRelativeDates(checked as boolean)}
                />
                <Label
                  htmlFor="relativeDates"
                  className="text-text-primary font-normal cursor-pointer"
                >
                  Set relative due dates based on content
                </Label>
              </div>

              {/* Mark critical tasks */}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="markCritical"
                  checked={markCritical}
                  onCheckedChange={(checked) => setMarkCritical(checked as boolean)}
                />
                <Label
                  htmlFor="markCritical"
                  className="text-text-primary font-normal cursor-pointer"
                >
                  Mark critical tasks as must-do items
                </Label>
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              These settings control how we interpret your Notion content
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => navigate("/roadmaps")}
              className="bg-transparent border-border-subtle text-text-primary hover:bg-background-elevated"
            >
              Cancel
            </Button>
            <Button className="bg-primary text-white hover:bg-primary/90">
              Import & Generate Roadmap
            </Button>
          </div>

          {/* Preview & Confirmation */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info size={20} className="text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-text-primary">
                After import, you'll be able to review and edit all generated tasks before saving
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Start from Scratch Tab */}
        <TabsContent value="from-scratch" className="space-y-6">
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-12">
            <div className="text-center space-y-4">
              <h3 className="text-xl font-semibold text-text-primary">Start from Scratch</h3>
              <p className="text-text-secondary">Coming soon...</p>
            </div>
          </div>
        </TabsContent>

        {/* Duplicate Existing Tab */}
        <TabsContent value="duplicate" className="space-y-6">
          <div className="bg-background-elevated rounded-lg border border-border-subtle p-12">
            <div className="text-center space-y-4">
              <h3 className="text-xl font-semibold text-text-primary">Duplicate Existing</h3>
              <p className="text-text-secondary">Coming soon...</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
