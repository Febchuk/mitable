import {
  Users,
  BarChart3,
  Plug,
  FileText,
  Paperclip,
  CalendarDays,
  Target,
  History,
  Sparkles,
} from "lucide-react";
import NavItem from "./NavItem";
import { useUser } from "../../context/UserContext";
import { useSubscription } from "../../hooks/queries/billing";
import { useVariant } from "../../context/VariantContext";
import { useDevFlags } from "../../context/DevFlagsContext";
import { useSidebar } from "../../context/SidebarContext";

export default function Nav() {
  const { user } = useUser();
  const { data: subscriptionData } = useSubscription();
  const { labels } = useVariant();
  const { flags } = useDevFlags();
  const { open } = useSidebar();
  const navClass = open ? "space-y-1 px-2" : "space-y-3 px-0";

  const isAdmin = user?.role === "admin";
  const tier = subscriptionData?.subscription?.tier;

  // Personal accounts (Free/Pro tiers) get a unified navigation
  // Team accounts continue with admin/employee split
  const isPersonalAccount = tier === "free" || tier === "pro";

  if (isPersonalAccount) {
    // Personal account navigation - unified view
    return (
      <nav className={navClass}>
        {flags.newExperience && <NavItem to="/calendar" icon={CalendarDays} label="Calendar" />}
        {flags.newExperience && <NavItem to="/recaps" icon={History} label="Recaps" />}
        {!flags.newExperience && <NavItem to="/monitoring" icon={Target} label="Sessions" />}
        <NavItem to="/docs" icon={FileText} label={labels.docs} />
        <NavItem to="/artefacts" icon={Paperclip} label={labels.artifacts} />
        {/* <NavItem to="/todos" icon={CheckSquare} label="Todos" /> */}
      </nav>
    );
  }

  if (isAdmin) {
    // Team admin navigation
    return (
      <nav className={navClass}>
        <NavItem to="/dashboard" icon={BarChart3} label="Dashboard" />
        <NavItem to="/people" icon={Users} label="People" />
        <NavItem to="/ask" icon={Sparkles} label="Ask" />
        <NavItem to="/integrations" icon={Plug} label="Integrations" />
      </nav>
    );
  }

  // Team employee navigation
  return (
    <nav className={navClass}>
      {flags.newExperience && <NavItem to="/calendar" icon={CalendarDays} label="Calendar" />}
      {flags.newExperience && <NavItem to="/recaps" icon={History} label="Recaps" />}
      {!flags.newExperience && <NavItem to="/monitoring" icon={Target} label="Sessions" />}
      <NavItem to="/docs" icon={FileText} label={labels.docs} />
      <NavItem to="/artefacts" icon={Paperclip} label={labels.artifacts} />
      {/* <NavItem to="/todos" icon={CheckSquare} label="Todos" /> */}
    </nav>
  );
}
