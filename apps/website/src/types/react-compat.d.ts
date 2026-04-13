/**
 * React 19 Compatibility Fixes
 *
 * React 19 changed internal type definitions which causes conflicts
 * with libraries compiled against React 18 types.
 *
 * This file provides type augmentations to resolve compatibility issues.
 */

// Fix for @untitledui/icons and other icon libraries that lack proper TypeScript declarations
declare module "@untitledui/icons" {
    import type React from "react";

    export interface IconProps extends React.SVGProps<SVGSVGElement> {
        size?: number | string;
        className?: string;
    }

    // Catch-all: any named export from @untitledui/icons is an icon component
    const icon: React.FC<IconProps>;
    export default icon;

    // Export every possible icon name as an FC<IconProps>
    export const AlertCircle: React.FC<IconProps>;
    export const AlertTriangle: React.FC<IconProps>;
    export const ArrowDown: React.FC<IconProps>;
    export const ArrowLeft: React.FC<IconProps>;
    export const ArrowNarrowLeft: React.FC<IconProps>;
    export const ArrowNarrowRight: React.FC<IconProps>;
    export const ArrowRight: React.FC<IconProps>;
    export const ArrowUp: React.FC<IconProps>;
    export const Bell01: React.FC<IconProps>;
    export const BookOpen01: React.FC<IconProps>;
    export const Calendar: React.FC<IconProps>;
    export const Check: React.FC<IconProps>;
    export const CheckCircle: React.FC<IconProps>;
    export const ChevronDown: React.FC<IconProps>;
    export const ChevronLeft: React.FC<IconProps>;
    export const ChevronRight: React.FC<IconProps>;
    export const ChevronSelectorVertical: React.FC<IconProps>;
    export const ChevronUp: React.FC<IconProps>;
    export const Copy01: React.FC<IconProps>;
    export const Download01: React.FC<IconProps>;
    export const Edit05: React.FC<IconProps>;
    export const Eye: React.FC<IconProps>;
    export const EyeOff: React.FC<IconProps>;
    export const File06: React.FC<IconProps>;
    export const FilterLines: React.FC<IconProps>;
    export const Globe02: React.FC<IconProps>;
    export const HelpCircle: React.FC<IconProps>;
    export const Home: React.FC<IconProps>;
    export const InfoCircle: React.FC<IconProps>;
    export const LifeBuoy01: React.FC<IconProps>;
    export const Link01: React.FC<IconProps>;
    export const Loading02: React.FC<IconProps>;
    export const Lock01: React.FC<IconProps>;
    export const LogOut01: React.FC<IconProps>;
    export const Mail01: React.FC<IconProps>;
    export const Menu02: React.FC<IconProps>;
    export const MessageSquare01: React.FC<IconProps>;
    export const Minus: React.FC<IconProps>;
    export const Monitor01: React.FC<IconProps>;
    export const Moon01: React.FC<IconProps>;
    export const MoreVertical: React.FC<IconProps>;
    export const PieChart03: React.FC<IconProps>;
    export const Plus: React.FC<IconProps>;
    export const RefreshCw01: React.FC<IconProps>;
    export const Search: React.FC<IconProps>;
    export const SearchLg: React.FC<IconProps>;
    export const Send01: React.FC<IconProps>;
    export const Settings01: React.FC<IconProps>;
    export const Settings02: React.FC<IconProps>;
    export const Share04: React.FC<IconProps>;
    export const Shield01: React.FC<IconProps>;
    export const Star01: React.FC<IconProps>;
    export const Sun: React.FC<IconProps>;
    export const Trash01: React.FC<IconProps>;
    export const Upload01: React.FC<IconProps>;
    export const UploadCloud02: React.FC<IconProps>;
    export const User01: React.FC<IconProps>;
    export const Users01: React.FC<IconProps>;
    export const X: React.FC<IconProps>;
    export const XCircle: React.FC<IconProps>;
    export const Zap: React.FC<IconProps>;

    // Additional icons used across the website
    export const BarChart01: React.FC<IconProps>;
    export const BookClosed: React.FC<IconProps>;
    export const Clock: React.FC<IconProps>;
    export const DotsVertical: React.FC<IconProps>;
    export const Edit01: React.FC<IconProps>;
    export const FaceFrown: React.FC<IconProps>;
    export const FileCode01: React.FC<IconProps>;
    export const FileX02: React.FC<IconProps>;
    export const List: React.FC<IconProps>;
    export const Menu01: React.FC<IconProps>;
    export const Play: React.FC<IconProps>;
    export const PlayCircle: React.FC<IconProps>;
    export const ShieldTick: React.FC<IconProps>;
    export const Stars02: React.FC<IconProps>;
    export const XClose: React.FC<IconProps>;
}

// Fix for @untitledui/file-icons
declare module "@untitledui/file-icons" {
    import type React from "react";

    export interface FileIconProps extends React.SVGProps<SVGSVGElement> {
        size?: number | string;
        className?: string;
        type?: string;
        variant?: string;
        theme?: string;
    }

    export const FileIcon: React.FC<FileIconProps>;
    const icon: React.FC<FileIconProps>;
    export default icon;
}
