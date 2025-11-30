import logoIconSvg from "../../../../assets/logo-icon.svg";
import { useSidebar } from "../../context/SidebarContext";

export default function Logo() {
  const { open } = useSidebar();

  return (
    <div
      className={`
      group flex items-center w-full px-4 pt-4 pb-4 transition-all
      ${open ? "justify-start" : "justify-center"}
    `}
    >
      <div className="flex items-center gap-2">
        <img src={logoIconSvg} alt="Mitable Logo" className="w-8 h-8 flex-shrink-0" />
        {open && <span className="text-white font-bold text-xl">mitable</span>}
      </div>
    </div>
  );
}
