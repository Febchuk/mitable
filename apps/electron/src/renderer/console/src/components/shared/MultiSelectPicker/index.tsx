/**
 * MultiSelectPicker
 *
 * Multi-select component for choosing from a predefined list of options.
 * Used for regularApps and regularTasks selection in the customer profile.
 */

import { useState, useMemo } from "react";
import { X, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MultiSelectPickerProps {
  options: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function MultiSelectPicker({
  options,
  selectedValues,
  onSelectionChange,
  placeholder = "Select options...",
  isLoading = false,
  disabled = false,
}: MultiSelectPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const handleToggle = (value: string) => {
    if (disabled) return;
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter((v) => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const handleClearAll = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const selectedCount = selectedValues.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-secondary">
        <div className="animate-pulse">Loading options...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {selectedCount === 0
            ? placeholder
            : `${selectedCount} ${selectedCount !== 1 ? "items" : "item"} selected`}
        </span>
        {selectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={disabled}
            className="h-6 px-2 text-xs text-text-secondary hover:text-text-primary"
          >
            <X size={12} className="mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input
          type="text"
          placeholder="Search options..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          className="pl-8 h-8 text-sm bg-background-elevated border-border-subtle"
        />
      </div>

      {/* Scrollable list */}
      <ScrollArea className="h-[200px] rounded-md border border-border-subtle">
        <div className="p-2 space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="text-center py-4 text-text-tertiary text-sm">
              {searchQuery ? `No results for "${searchQuery}"` : "No options available"}
            </div>
          ) : (
            filteredOptions.map((option) => (
              <label
                key={option}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-background-elevated"
                }`}
              >
                <Checkbox
                  checked={selectedValues.includes(option)}
                  onCheckedChange={() => handleToggle(option)}
                  disabled={disabled}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="text-sm text-text-primary">{option}</span>
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
