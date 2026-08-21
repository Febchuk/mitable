import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { createLogger } from "../../lib/logger";

export function registerPdfExportHandlers() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dialog } = require("electron") as typeof import("electron");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { writeFile } = require("fs/promises") as typeof import("fs/promises");

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PDF,
    async (_, { html, title }: { html: string; title: string }) => {
      const pdfLogger = createLogger("PDFExport");
      try {
        const win = new BrowserWindow({
          width: 800,
          height: 1100,
          show: false,
          webPreferences: {
            offscreen: true,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });

        const styledHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; font-size: 13px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
  h3 { font-size: 14px; margin-top: 20px; margin-bottom: 6px; }
  p { margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  th { font-weight: 600; background: #f5f5f5; }
  ul, ol { padding-left: 24px; }
  li { margin-bottom: 4px; }
  strong { font-weight: 600; }
</style></head><body>${html}</body></html>`;

        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);

        await new Promise((r) => setTimeout(r, 500));

        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
        });

        win.close();

        const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim() || "Report";
        const { filePath } = await dialog.showSaveDialog({
          defaultPath: `${sanitizedTitle}.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });

        if (filePath) {
          await writeFile(filePath, pdfBuffer);
          pdfLogger.info("PDF saved to:", filePath);
          return { success: true, filePath };
        }

        return { success: false, cancelled: true };
      } catch (error) {
        pdfLogger.error("PDF export failed:", error);
        return { success: false, error: String(error) };
      }
    }
  );
}
