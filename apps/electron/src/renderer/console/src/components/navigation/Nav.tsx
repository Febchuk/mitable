import { Calendar, FileText, Download } from "lucide-react";
import NavItem from "./NavItem";
import MitableIcon from "../icons/MitableIcon";

export default function Nav() {
  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavItem to="/agent" icon={MitableIcon} label="Agent" />
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
