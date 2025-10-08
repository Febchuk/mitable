interface AvatarProps {
  name: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  className?: string;
}

export default function Avatar({
  name,
  imageUrl,
  size = "md",
  online,
  className = "",
}: AvatarProps) {
  const sizeStyles = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };

  const indicatorSizeStyles = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3 h-3",
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        className={`${sizeStyles[size]} rounded-full bg-primary flex items-center justify-center font-medium text-white overflow-hidden`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 ${indicatorSizeStyles[size]} rounded-full border-2 border-background-primary ${
            online ? "bg-status-success" : "bg-text-tertiary"
          }`}
        />
      )}
    </div>
  );
}
