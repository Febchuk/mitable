import { PanelLeft } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import logoIconSvg from "../../../../assets/logo-icon.svg";

export default function Logo() {
  const { open, toggle } = useSidebar();
  const { user } = useUser();

  return (
    <div
      className={`
      group flex items-center w-full px-4 pt-8 pb-4 transition-all
      ${open ? "justify-between" : "justify-center"}
    `}
    >
      {open ? (
        <>
          <div className="flex items-center gap-2">
            <img src={logoIconSvg} alt="Mitable Logo" className="w-8 h-8 flex-shrink-0" />
            <span className="text-white font-bold text-xl">mitable</span>
            {user?.role === "admin" && (
              <span className="bg-[#E0D7FF] text-[#1A1A1A] text-xs font-semibold px-3 py-1 rounded-full">
                Admin
              </span>
            )}
          </div>
          <button
            onClick={toggle}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        </>
      ) : (
        <div className="relative">
          <img src={logoIconSvg} alt="Mitable Logo" className="w-8 h-8" />
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto bg-[#1A1A1A] rounded-md transition-all"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
