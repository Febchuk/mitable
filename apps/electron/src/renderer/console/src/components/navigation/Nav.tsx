import { Calendar, BarChart2, Download } from "lucide-react";
import NavItem from "./NavItem";
import MitableIcon from "../icons/MitableIcon";

export default function Nav() {
  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavItem to="/agent" icon={MitableIcon} label="Agent" />
      <NavItem to="/reports" icon={BarChart2} label="Reports" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
