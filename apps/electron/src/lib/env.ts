import { app } from "electron";

export const isDev = !app.isPackaged;

/**
 * OS keychain service name — separated so dev and prod credentials
 * never collide.
 */
export const KEYCHAIN_SERVICE = isDev ? "MitableDev" : "Mitable";

/**
 * Root folder name under ~/Documents for block.md and other user files.
 */
export const DOCUMENTS_FOLDER = isDev ? "Mitable_Dev" : "Mitable";
