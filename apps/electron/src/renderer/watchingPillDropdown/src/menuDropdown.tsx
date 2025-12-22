import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MenuDropdownApp from "./MenuDropdownApp";
import "../../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MenuDropdownApp />
  </StrictMode>
);
