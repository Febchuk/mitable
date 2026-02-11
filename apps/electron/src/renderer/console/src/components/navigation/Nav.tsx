import { Layers, Users, BarChart3, Plug, FileText, Paperclip, CalendarDays, Target, History } from "lucide-react";
import NavItem from "./NavItem";
import { useUser } from "../../context/UserContext";
import { useSubscription } from "../../hooks/queries/billing";
import { useVariant } from "../../context/VariantContext";

export default function Nav() {
  const { user } = useUser();
  const { data: subscriptionData } = useSubscription();
  const { labels } = useVariant();

  const isAdmin = user?.role === "admin";
  const tier = subscriptionData?.subscription?.tier;

  // Personal accounts (Free/Pro tiers) get a unified navigation
  // Team accounts continue with admin/employee split
  const isPersonalAccount = tier === "free" || tier === "pro";

  if (isPersonalAccount) {
    // Personal account navigation - unified view
    return (
      <nav className="space-y-1 px-2">
        <NavItem to="/calendar" icon={CalendarDays} label="Calendar" />
        <NavItem to="/recaps" icon={History} label="Recaps" />
        <NavItem to="/monitoring" icon={Target} label="Sessions" />
        <NavItem to="/docs" icon={FileText} label={labels.docs} />
        <NavItem to="/artefacts" icon={Paperclip} label={labels.artifacts} />
        {/* <NavItem to="/todos" icon={CheckSquare} label="Todos" /> */}
      </nav>
    );
  }

  if (isAdmin) {
    // Team admin navigation
    return (
      <nav className="space-y-1 px-2">
        <NavItem to="/dashboard" icon={BarChart3} label="Dashboard" />
        <NavItem to="/people" icon={Users} label="People" />
        <NavItem to="/templates" icon={Layers} label="Templates" />
        <NavItem to="/integrations" icon={Plug} label="Integrations" />
      </nav>
    );
  }

  // Team employee navigation
  return (
    <nav className="space-y-1 px-2">
      <NavItem to="/calendar" icon={CalendarDays} label="Calendar" />
      <NavItem to="/recaps" icon={History} label="Recaps" />
      <NavItem to="/monitoring" icon={Target} label="Sessions" />
      <NavItem to="/docs" icon={FileText} label={labels.docs} />
      <NavItem to="/artefacts" icon={Paperclip} label={labels.artifacts} />
      {/* <NavItem to="/todos" icon={CheckSquare} label="Todos" /> */}
    </nav>
  );
}
