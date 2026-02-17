import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Monitor, PanelLeft, Shield } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import { useSubscription } from "@/console/src/hooks/queries/billing";
import TierBadge from "@/console/src/components/billing/TierBadge";

import { useNavigate } from "react-router-dom";

// Detect platform for layout adjustments
const isMac = navigator.platform.toLowerCase().includes("mac");

export default function TitleBar() {
  const { user, updateUser } = useUser();
  const { toggle } = useSidebar();
  const navigate = useNavigate();
  const { data: subscriptionData } = useSubscription();

  // Only show switcher if user is actually an admin
  const canSwitchRoles = user?.role === "admin" || user?.originalRole === "admin";
  const tier = subscriptionData?.subscription?.tier;

  const handleRoleChange = (role: "admin" | "employee") => {
    if (user) {
      updateUser({
        ...user,
        role,
        // Preserve originalRole so admins can always switch back
        originalRole: user.originalRole ?? user.role,
      });

      // Persist mode so it survives app restarts
      localStorage.setItem("mitable:lastMode", role);

      // Auto-navigate to appropriate default view
      if (role === "admin") {
        navigate("/dashboard");
      } else {
        navigate("/calendar");
      }
    }
  };

  // macOS: left padding for traffic lights, Windows: right padding for titleBarOverlay controls
  const titleBarPadding = isMac ? "pl-20 pr-3" : "pl-3 pr-36";

  if (!canSwitchRoles) {
    return (
      <div
        className={`h-8 flex items-center justify-between ${titleBarPadding} py-4 app-drag relative z-50`}
      >
        <div className="app-no-drag">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10 rounded-md"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="app-no-drag">{tier && <TierBadge tier={tier} className="my-1" />}</div>
      </div>
    );
  }

  return (
    <div
      className={`h-8 flex items-center justify-between ${titleBarPadding} py-4 app-drag relative z-50`}
    >
      <div className="app-no-drag">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10 rounded-md"
        >
          <PanelLeft className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="app-no-drag flex items-center gap-2">
        {tier && <TierBadge tier={tier} className="my-1" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full px-2.5"
            >
              {user?.role === "admin" ? (
                <>
                  <Shield className="w-3 h-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Admin</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3 h-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Employee</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 bg-[#1A1A1A] border-white/10 text-white">
            <DropdownMenuItem
              onClick={() => handleRoleChange("employee")}
              className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
            >
              <Monitor className="w-4 h-4" />
              <span>Employee</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleRoleChange("admin")}
              className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>Admin</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
