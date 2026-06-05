import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { randomUUID } from "crypto";

let _bcrypt: typeof import("bcryptjs") | null = null;

async function getBcrypt(): Promise<typeof import("bcryptjs")> {
  if (!_bcrypt) {
    const mod: any = await import("bcryptjs");
    _bcrypt = mod.default || mod;
  }
  return _bcrypt!;
}

async function clearBackendAuth(): Promise<void> {
  try {
    const { ctx } = await import("../context");
    ctx.authTokens = { accessToken: null, refreshToken: null };
  } catch {
    /* best effort */
  }
}

export function registerLocalAuthHandlers() {
  ipcMain.handle(IPC_CHANNELS.LOCAL_AUTH_LIST_ACCOUNTS, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();
      return await pgDb.getAllLocalAccounts();
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_AUTH_CREATE,
    async (_, data: { email: string; password: string; firstName: string; lastName: string }) => {
      try {
        const { pgDb } = await import("../../services/on-device");
        if (!pgDb.isAvailable()) await pgDb.tryOpen();

        const existing = await pgDb.getLocalAccountByEmail(data.email);
        if (existing) {
          return { success: false, error: "An account with this email already exists" };
        }

        const bcrypt = await getBcrypt();
        const passwordHash = await bcrypt.hash(data.password, 10);
        const userId = randomUUID();

        await pgDb.createLocalAccount({
          id: userId,
          email: data.email.toLowerCase().trim(),
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
        });

        await pgDb.setUserPreference("system", "activeLocalUserId", userId);
        await clearBackendAuth();

        return { success: true, userId };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.LOCAL_AUTH_LOGIN, async (_, email: string, password: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      const account = await pgDb.getLocalAccountByEmail(email.toLowerCase().trim());
      if (!account) {
        return { success: false, error: "No account found with this email" };
      }

      const bcrypt = await getBcrypt();
      const valid = await bcrypt.compare(password, account.passwordHash);
      if (!valid) {
        return { success: false, error: "Incorrect password" };
      }

      await pgDb.setUserPreference("system", "activeLocalUserId", account.id);
      await clearBackendAuth();

      return {
        success: true,
        userId: account.id,
        firstName: account.firstName,
        lastName: account.lastName,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_AUTH_LOGOUT, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (pgDb.isAvailable()) {
        await pgDb.setUserPreference("system", "activeLocalUserId", "");
      }
      const { ctx } = await import("../context");
      ctx.currentUserContext = null;
    } catch {
      // best effort
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_AUTH_GET_USER, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      const activeId = await pgDb.getUserPreference("system", "activeLocalUserId");
      if (!activeId) return null;

      return await pgDb.getLocalAccountById(activeId);
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_AUTH_HAS_ACCOUNT, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) await pgDb.tryOpen();

      return (await pgDb.getAnyLocalAccount()) !== null;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_AUTH_RESET_PASSWORD,
    async (_, email: string, oldPassword: string, newPassword: string) => {
      try {
        const { pgDb } = await import("../../services/on-device");
        if (!pgDb.isAvailable()) await pgDb.tryOpen();

        const account = await pgDb.getLocalAccountByEmail(email.toLowerCase().trim());
        if (!account) {
          return { success: false, error: "No account found with this email" };
        }

        const bcrypt = await getBcrypt();
        const valid = await bcrypt.compare(oldPassword, account.passwordHash);
        if (!valid) {
          return { success: false, error: "Current password is incorrect" };
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pgDb.updateLocalAccountPassword(account.id, newHash);

        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );
}
