import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EyeDropdownApp from "./EyeDropdownApp";
import "../../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EyeDropdownApp />
  </StrictMode>
);
