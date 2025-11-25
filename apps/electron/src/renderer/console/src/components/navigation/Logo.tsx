import logoIconSvg from "../../../../assets/logo-icon.svg";

export default function Logo() {
  return (
    <div className="flex items-center justify-center">
      <img src={logoIconSvg} alt="Mitable Logo" className="w-10 h-10" />
    </div>
  );
}
