import { Calendar, Download, LayoutGrid, User, BarChart2, FileText } from "lucide-react";
import NavItem from "./NavItem";
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
        <NavItem to="/people" icon={User} label="People" />
      </>
    );
  }

  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavItem to="/agent" icon={MitableIcon} label="Agent" />
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
