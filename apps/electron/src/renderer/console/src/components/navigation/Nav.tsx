import { Calendar, Download, LayoutGrid, User, Users, BarChart2, FileText, Target, Award } from "lucide-react";
import NavItem from "./NavItem";
import NavGroup from "./NavGroup";
import MitableIcon from "../icons/MitableIcon";
import type { ViewMode } from "../../types";

interface NavProps {
  viewMode: ViewMode;
}

export default function Nav({ viewMode }: NavProps) {
  if (viewMode === "manager") {
    return (
      <>
        <NavItem to="/dashboard" icon={LayoutGrid} label="Dashboard" />
        <NavItem to="/people" icon={Users} label="People" />
        <NavItem to="/benchmarks" icon={Target} label="Benchmarks" />
        {/* <NavItem to="/reports" icon={BarChart2} label="Reports" /> */}
        {/* <NavItem to="/agent" icon={MitableIcon} label="Agent" /> */}
      </>
    );
  }

  // Employee (My View)
  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavGroup to="/me" icon={User} label="Me">
        <NavItem to="/bragbook" icon={Award} label="Bragbook" />
        <NavItem to="/benchmarks" icon={Target} label="Benchmarks" />
      </NavGroup>
      <NavItem to="/agent" icon={MitableIcon} label="Agent" />
      <NavItem to="/docs" icon={FileText} label="Docs" />
      {/* <NavItem to="/uploads" icon={Download} label="Uploads" /> */}
    </>
  );
}
