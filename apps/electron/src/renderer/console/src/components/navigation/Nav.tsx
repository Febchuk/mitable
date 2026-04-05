import {
  Calendar,
  Download,
  LayoutGrid,
  User,
  BarChart2,
  FileText,
  Target,
  Award,
} from "lucide-react";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import MitableIcon from "../icons/MitableIcon";

interface NavProps {
  isAdminView?: boolean;
}

export default function Nav({ isAdminView = false }: NavProps) {
  if (isAdminView) {
    return (
      <>
        <NavItem to="/dashboard" icon={LayoutGrid} label="Dashboard" />
        <NavItem to="/agent" icon={MitableIcon} label="Agent" />
        <NavItem to="/reports" icon={BarChart2} label="Reports" />
        <NavItem to="/benchmarks" icon={Target} label="Benchmarks" />
        <NavItem to="/people" icon={User} label="People" />
      </>
    );
  }

  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavGroup to="/me" icon={User} label="Me">
        <NavItem to="/bragbook" icon={Award} label="Bragbook" />
        <NavItem to="/benchmarks" icon={Target} label="Benchmarks" />
      </NavGroup>
      <NavItem to="/agent" icon={MitableIcon} label="Agent" />
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
