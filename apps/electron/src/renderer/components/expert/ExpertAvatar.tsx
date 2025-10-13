import { ExpertProfile } from "@mitable/shared";

interface ExpertAvatarProps {
  expert: ExpertProfile;
  isBestMatch?: boolean;
  size?: "sm" | "md" | "lg";
}

const getStatusColor = (availability: ExpertProfile["availability"]) => {
  switch (availability) {
    case "available":
      return "bg-green-500";
    case "away":
      return "bg-yellow-500";
    case "busy":
      return "bg-red-500";
    case "offline":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
};

const getInitials = (name: string): string => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function ExpertAvatar({ expert, isBestMatch = false, size = "md" }: ExpertAvatarProps) {
  const sizeClasses = {
    sm: "w-10 h-10 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-16 h-16 text-xl",
  };

  const statusSizeClasses = {
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  const borderClasses = isBestMatch
    ? "ring-2 ring-yellow-500 ring-offset-2 ring-offset-background-primary"
    : "";

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClasses[size]} ${borderClasses} rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold`}
      >
        {getInitials(expert.name)}
      </div>
      <div
        className={`absolute bottom-0 right-0 ${statusSizeClasses[size]} ${getStatusColor(
          expert.availability
        )} rounded-full border-2 border-background-primary`}
      />
    </div>
  );
}
