# Component Library

This directory contains all reusable components for the Mitable application, organized by purpose and lifecycle.

## Directory Structure

```
components/
├── ui/              # ShadCN components (Radix UI + Tailwind)
├── domain/          # Domain-specific business components
├── legacy/          # Legacy custom components (to be migrated)
└── README.md        # This file
```

## Component Categories

### 🎨 UI Components (`ui/`)

Professional, accessible components from [ShadCN UI](https://ui.shadcn.com/) built on top of Radix UI primitives.

**Available Components:**

- `Button` - Versatile button with variants (default, destructive, outline, secondary, ghost, link)
- `Card` - Content container with header, title, description, content, and footer sections
- `Badge` - Status indicators with variants (default, secondary, destructive, outline)
- `Avatar` - User avatar with fallback support
- `Input` - Form input field
- `Label` - Accessible form label
- `Progress` - Progress indicator bar
- `Tooltip` - Contextual information on hover
- `Dialog` - Modal dialog with overlay
- `Select` - Dropdown selection menu
- `Tabs` - Tabbed interface
- `Checkbox` - Checkbox input with label

**Usage Example:**

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>Get started with your onboarding</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="outline">Week 1</Badge>
        <Button onClick={() => console.log("Clicked!")}>Continue</Button>
      </CardContent>
    </Card>
  );
}
```

**Features:**

- ✅ Full TypeScript support with proper typing
- ✅ Accessible by default (ARIA attributes, keyboard navigation)
- ✅ Dark mode ready (uses CSS variables from globals.css)
- ✅ Customizable via className prop
- ✅ Consistent styling with design system

### 🏢 Domain Components (`domain/`)

Business-specific components that encapsulate domain logic and data.

#### Expert Components (`domain/expert/`)

- `ExpertCard` - Display expert profile with match score, availability, and escalation action
- `ExpertAvatar` - Expert avatar with online status and best match indicator

**Usage:**

```tsx
import ExpertCard from "@/components/domain/expert/ExpertCard";
import ExpertAvatar from "@/components/domain/expert/ExpertAvatar";

<ExpertCard
  expert={expertProfile}
  matchScore={0.92}
  isBestMatch={true}
  onEscalate={(id) => console.log("Escalate to", id)}
/>;
```

#### Message Components (`domain/messages/`)

- `UserMessage` - User message bubble in conversation
- `AIMessage` - AI assistant message bubble with streaming support

**Usage:**

```tsx
import UserMessage from "@/components/domain/messages/UserMessage"
import AIMessage from "@/components/domain/messages/AIMessage"

<UserMessage content="How do I set up my development environment?" />
<AIMessage content="Let me guide you through the setup process..." />
```

### 🔧 Legacy Components (`legacy/`)

Custom components from the initial implementation. These will be gradually migrated to use ShadCN components.

**Current Legacy Components:**

- `ToggleSwitch` - Text/Audio mode toggle (used in Agent window)
- `InteractiveCard` - Clickable card with icon (used in conversation flow)

**Migration Status:**

- ⏳ `ToggleSwitch` - Pending migration to ShadCN Switch
- ⏳ `InteractiveCard` - Pending migration to ShadCN Card + Button

**DO NOT** create new legacy components. Use ShadCN UI components for all new features.

## Design System

### Theme Configuration

The design system uses CSS variables defined in `styles/globals.css`:

**Primary Colors:**

- `--primary` - Indigo (#6366F1 / hsl(250 84% 65%))
- `--background` - Black (#000000) for dark mode
- `--foreground` - White text on dark background

**Legacy Colors (for backward compatibility):**

- `background-primary`, `background-secondary`, `background-tertiary`
- `text-primary`, `text-secondary`, `text-tertiary`
- `agent`, `console`, `overlay`, `guide`, `nudge` window-specific colors

### Typography

- Font: Inter
- Base size: 14px
- Scale: sm (12px), base (14px), lg (16px), xl (20px), 2xl (24px)

### Spacing

- Scale: 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px), 12 (48px)

### Border Radius

- sm: 6px
- md: 10px (default)
- lg: 16px
- xl: 24px

## Best Practices

### 1. Always Use ShadCN for New Features

```tsx
// ✅ Good - Use ShadCN components
import { Button } from "@/components/ui/button";

// ❌ Bad - Don't create custom buttons
const CustomButton = styled.button`...`;
```

### 2. Compose Components

```tsx
// ✅ Good - Compose smaller components
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    <Button>Action</Button>
  </CardContent>
</Card>

// ❌ Bad - One giant component
<CustomCardWithEverything />
```

### 3. Use Path Aliases

```tsx
// ✅ Good - Clean imports
import { Button } from "@/components/ui/button";
import ExpertCard from "@/components/domain/expert/ExpertCard";

// ❌ Bad - Relative path hell
import { Button } from "../../../../components/ui/button";
```

### 4. Extend with className, Not Custom Styles

```tsx
// ✅ Good - Use Tailwind utilities
<Button className="w-full mt-4">
  Full Width Button
</Button>

// ❌ Bad - Inline styles
<Button style={{ width: "100%", marginTop: "16px" }}>
  Full Width Button
</Button>
```

### 5. Leverage Variants

```tsx
// ✅ Good - Use built-in variants
<Button variant="destructive" size="lg">Delete</Button>
<Badge variant="outline">Status</Badge>

// ❌ Bad - Custom styling for every instance
<Button className="bg-red-500 text-white px-8 py-4">Delete</Button>
```

## Adding New ShadCN Components

To add more components from the ShadCN registry:

```bash
cd apps/electron
npx shadcn@latest add [component-name]
```

Example:

```bash
npx shadcn@latest add dropdown-menu
npx shadcn@latest add popover
npx shadcn@latest add sheet
```

Components will be automatically added to `src/renderer/components/ui/` with proper configuration.

## Migration Guide

When migrating legacy components to ShadCN:

1. **Identify the equivalent ShadCN component**
   - Check [ShadCN UI docs](https://ui.shadcn.com/docs/components) for available components
   - Install if not already available: `npx shadcn@latest add [component]`

2. **Update the component implementation**
   - Replace custom styled components with ShadCN imports
   - Use `className` prop for customization
   - Preserve existing props and behavior

3. **Update all imports**
   - Search for imports of the legacy component
   - Update to use the new ShadCN-based version
   - Test all affected features

4. **Move to appropriate folder**
   - If it's a pure UI element → `ui/`
   - If it has domain logic → `domain/[category]/`
   - Delete from `legacy/` when migration is complete

### Example Migration: InteractiveCard

**Before (Legacy):**

```tsx
// legacy/InteractiveCard.tsx
export default function InteractiveCard({ title, subtitle, icon, onClick }) {
  return (
    <div className="custom-card" onClick={onClick}>
      {/* ... custom implementation */}
    </div>
  );
}
```

**After (ShadCN):**

```tsx
// Use ShadCN Card directly
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

<Card className="cursor-pointer hover:bg-accent" onClick={onClick}>
  <CardHeader>
    <Icon className="w-6 h-6 mb-2" />
    <CardTitle>{title}</CardTitle>
    <CardDescription>{subtitle}</CardDescription>
  </CardHeader>
</Card>;
```

## Utility Functions

### `cn()` - Merge Tailwind Classes

The `cn()` utility (from `@/lib/utils`) merges Tailwind classes correctly:

```tsx
import { cn } from "@/lib/utils";

// Handles conflicts properly (bg-red-500 overrides bg-blue-500)
<Button className={cn("bg-blue-500", isError && "bg-red-500")}>Submit</Button>;
```

## Resources

- **ShadCN UI Docs**: https://ui.shadcn.com/docs
- **Radix UI Docs**: https://www.radix-ui.com/primitives/docs/overview/introduction
- **Tailwind CSS Docs**: https://tailwindcss.com/docs
- **Lucide Icons**: https://lucide.dev/icons/

## Questions?

For questions about component usage or design system decisions, refer to:

- `CLAUDE.md` - Project overview and architecture
- `docs/mitable_complete_prd.md` - Complete product specification
- ShadCN UI documentation for component-specific questions
