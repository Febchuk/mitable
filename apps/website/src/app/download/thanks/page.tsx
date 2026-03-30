import type { Metadata } from "next";
import { Suspense } from "react";
import { ThanksScreen } from "./thanks-screen";

export const metadata: Metadata = {
    title: "Installing Mitable",
    description: "Your download has started. Follow these steps to finish installing Mitable.",
};

export default function ThanksPage() {
    return (
        <Suspense>
            <ThanksScreen />
        </Suspense>
    );
}
