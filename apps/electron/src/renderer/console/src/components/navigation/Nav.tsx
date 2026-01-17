import { Layers, Users, BarChart3, Plug, Activity, FileText, CheckSquare } from "lucide-react";
import NavItem from "./NavItem";
import { useUser } from "../../context/UserContext";
import { useSubscription } from "../../hooks/queries/billing";

export default function Nav() {
  const { user } = useUser();
  const { data: subscriptionData } = useSubscription();

  const isAdmin = user?.role === "admin";
  const tier = subscriptionData?.subscription?.tier;

  // Personal accounts (Free/Pro tiers) get a unified navigation
  // Team accounts continue with admin/employee split
  const isPersonalAccount = tier === "free" || tier === "pro";

  if (isPersonalAccount) {
    // Personal account navigation - unified view
    return (
      <nav className="space-y-1 px-2">
        <NavItem to="/monitoring" icon={Activity} label="Sessions" />
        <NavItem to="/todos" icon={CheckSquare} label="Todos" />
        <NavItem to="/docs" icon={FileText} label="Docs" />
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
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/monitoring" icon={Activity} label="Sessions" />
      <NavItem to="/todos" icon={CheckSquare} label="Todos" />
    </nav>
  );
}
