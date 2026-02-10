import { createContext, ReactNode, useContext } from "react";
import { OrgVariant, VARIANT_LABELS, VariantLabels } from "@mitable/shared";

interface VariantContextValue {
  variant: OrgVariant;
  labels: VariantLabels;
}

const defaultValue: VariantContextValue = {
  variant: "global",
  labels: VARIANT_LABELS.global,
};

const VariantContext = createContext<VariantContextValue>(defaultValue);

interface VariantProviderProps {
  children: ReactNode;
  variant?: OrgVariant;
}

/**
 * VariantProvider - Provides organization variant context to the app.
 *
 * The variant determines UI labels for features like Docs/Reports and Artifacts/Uploads.
 * Get the variant from organization settings (via useUser or auth response).
 *
 * @example
 * ```tsx
 * // In App.tsx or layout component
 * const { organization } = useUser();
 * const variant = organization?.settings?.variant || "global";
 *
 * return (
 *   <VariantProvider variant={variant}>
 *     <App />
 *   </VariantProvider>
 * );
 * ```
 */
export function VariantProvider({ children, variant = "global" }: VariantProviderProps) {
  const labels = VARIANT_LABELS[variant];

  return <VariantContext.Provider value={{ variant, labels }}>{children}</VariantContext.Provider>;
}

/**
 * useVariant - Hook to access organization variant and labels.
 *
 * @example
 * ```tsx
 * function DocsView() {
 *   const { labels } = useVariant();
 *
 *   return (
 *     <div>
 *       <h1>{labels.docs}</h1>  // "Docs" or "Reports"
 *       <button>{labels.createDocument}</button>  // "Create Document" or "Create Report"
 *     </div>
 *   );
 * }
 * ```
 */
export function useVariant() {
  const context = useContext(VariantContext);
  if (!context) {
    throw new Error("useVariant must be used within a VariantProvider");
  }
  return context;
}
