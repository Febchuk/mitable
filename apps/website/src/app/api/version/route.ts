import { NextResponse } from "next/server";

const R2_BASE = "https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev";
const LATEST_MAC_YML = `${R2_BASE}/latest-mac.yml`;
const FALLBACK_VERSION = "0.1.48";

function buildUrls(version: string) {
    return {
        "mac-arm": `${R2_BASE}/Mitable-${version}-arm64.dmg`,
        "mac-intel": `${R2_BASE}/Mitable-${version}-x64.dmg`,
        windows: `${R2_BASE}/Mitable-${version}-x64.exe`,
    };
}

export async function GET() {
    try {
        const res = await fetch(LATEST_MAC_YML, { next: { revalidate: 60 } });
        if (!res.ok) throw new Error(`R2 returned ${res.status}`);

        const text = await res.text();
        const match = text.match(/^version:\s*(.+)$/m);
        const version = match?.[1]?.trim() ?? FALLBACK_VERSION;

        return NextResponse.json(
            { version, urls: buildUrls(version) },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
                },
            },
        );
    } catch {
        return NextResponse.json({ version: FALLBACK_VERSION, urls: buildUrls(FALLBACK_VERSION) }, { status: 200 });
    }
}
