/**
 * React 19 Compatibility Fixes
 *
 * React 19 changed internal type definitions which causes conflicts
 * with libraries compiled against React 18 types.
 *
 * This file provides type augmentations to resolve compatibility issues.
 */

declare module "react" {
    // Extend ReactNode to be compatible with older library definitions
    type ReactNode = React.ReactElement | string | number | Iterable<React.ReactNode> | React.ReactPortal | boolean | null | undefined;
}

// Fix for @untitledui/icons and other icon libraries
declare module "@untitledui/icons" {
    import { FC, SVGProps } from "react";

    export interface IconProps extends SVGProps<SVGSVGElement> {
        size?: number | string;
        className?: string;
    }

    export const UploadCloud02: FC<IconProps>;
    // Add other icons as needed
}
