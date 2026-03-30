import type { Metadata } from "next";
import { DownloadScreen } from "./download-screen";

export const metadata: Metadata = {
    title: "Download Mitable",
    description: "Download Mitable for macOS (Apple Silicon & Intel) or Windows.",
};

export default function DownloadPage() {
    return <DownloadScreen />;
}
