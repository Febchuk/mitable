interface MitableIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

/**
 * Mitable logo — three vertical rounded bars.
 * Renders as `fill="currentColor"` so it inherits the parent's text color.
 */
export default function MitableIcon({ size = 24, className, style, ...rest }: MitableIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...rest}
    >
      <rect x="3" y="5.5" width="5" height="13" rx="2.5" fill="currentColor" />
      <rect x="9.5" y="2" width="5" height="20" rx="2.5" fill="currentColor" />
      <rect x="16" y="5.5" width="5" height="13" rx="2.5" fill="currentColor" />
    </svg>
  );
}
