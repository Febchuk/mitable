import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { dirname, join } from "path";
import electronLogMain from "electron-log/main";

const FEEDBACK_MAIN_LOG_TAIL_LINES = 10_000;
const FEEDBACK_RENDERER_LOG_TAIL_LINES = 10_000;
const MAIN_LOG_READ_MAX_BYTES = 4 * 1024 * 1024;
const RENDERER_LOG_MAX_BYTES = 12 * 1024 * 1024;
const RENDERER_LOG_READ_MAX_BYTES = 6 * 1024 * 1024;

function getRendererLogPath(): string | null {
  const mainPath = electronLogMain.transports.file.getFile()?.path;
  if (!mainPath) return null;
  return join(dirname(mainPath), "renderer.log");
}

export function registerFeedbackHandlers() {
  ipcMain.on(IPC_CHANNELS.FEEDBACK_APPEND_RENDERER_LOG, (_event, chunk: unknown) => {
    if (typeof chunk !== "string" || chunk.length === 0) return;
    if (chunk.length > 1_500_000) return;
    void (async () => {
      try {
        const fsp = await import("fs/promises");
        const rPath = getRendererLogPath();
        if (!rPath) return;
        await fsp.appendFile(rPath, chunk, "utf8");
        const st = await fsp.stat(rPath);
        if (st.size > RENDERER_LOG_MAX_BYTES) {
          const bak = `${rPath}.1`;
          try {
            await fsp.unlink(bak);
          } catch {
            /* no prior backup */
          }
          await fsp.rename(rPath, bak);
          await fsp.writeFile(
            rPath,
            `${new Date().toISOString()} [console.log] [renderer] Older lines rotated to renderer.log.1 (size cap)\n`,
            "utf8"
          );
        }
      } catch {
        /* avoid breaking renderer */
      }
    })();
  });

  ipcMain.handle(IPC_CHANNELS.FEEDBACK_GET_LOGS, async () => {
    try {
      const mainPath = electronLogMain.transports.file.getFile()?.path;
      if (!mainPath) {
        return { success: false, logs: "", rendererLogs: "", error: "Log file path not found" };
      }

      const fsp = await import("fs/promises");

      let mainContent = "";
      const stMain = await fsp.stat(mainPath).catch(() => null);
      if (stMain && stMain.size > 0) {
        if (stMain.size <= MAIN_LOG_READ_MAX_BYTES) {
          mainContent = await fsp.readFile(mainPath, "utf-8");
        } else {
          const fh = await fsp.open(mainPath, "r");
          try {
            const start = Number(stMain.size) - MAIN_LOG_READ_MAX_BYTES;
            const buf = Buffer.alloc(MAIN_LOG_READ_MAX_BYTES);
            await fh.read(buf, 0, MAIN_LOG_READ_MAX_BYTES, start);
            let s = buf.toString("utf8");
            const nl = s.indexOf("\n");
            if (nl !== -1) s = s.slice(nl + 1);
            mainContent =
              `...[main.log: last ~${Math.round(MAIN_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
              s;
          } finally {
            await fh.close();
          }
        }
      }
      const mainLines = mainContent.split("\n");
      const mainTail = mainLines.slice(-FEEDBACK_MAIN_LOG_TAIL_LINES).join("\n");

      let rendererLogs = "";
      const rPath = getRendererLogPath();
      if (rPath) {
        try {
          const st = await fsp.stat(rPath).catch(() => null);
          if (st && st.size > 0) {
            if (st.size <= RENDERER_LOG_READ_MAX_BYTES) {
              rendererLogs = await fsp.readFile(rPath, "utf-8");
            } else {
              const fh = await fsp.open(rPath, "r");
              try {
                const start = Number(st.size) - RENDERER_LOG_READ_MAX_BYTES;
                const buf = Buffer.alloc(RENDERER_LOG_READ_MAX_BYTES);
                await fh.read(buf, 0, RENDERER_LOG_READ_MAX_BYTES, start);
                let s = buf.toString("utf8");
                const nl = s.indexOf("\n");
                if (nl !== -1) s = s.slice(nl + 1);
                rendererLogs =
                  `...[renderer.log: last ~${Math.round(RENDERER_LOG_READ_MAX_BYTES / 1024)}KB of file]\n\n` +
                  s;
              } finally {
                await fh.close();
              }
            }
          }
        } catch {
          rendererLogs = "";
        }
        if (rendererLogs) {
          const rl = rendererLogs.split("\n");
          rendererLogs = rl.slice(-FEEDBACK_RENDERER_LOG_TAIL_LINES).join("\n");
        }
      }

      return { success: true, logs: mainTail, rendererLogs };
    } catch (err) {
      return { success: false, logs: "", rendererLogs: "", error: String(err) };
    }
  });
}
