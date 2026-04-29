/**
 * Offline capture queue (IndexedDB).
 *
 * When a teacher hits send while offline (or the network call fails
 * for transport reasons), the capture goes here instead of being
 * dropped. The drain logic in 6.3 will re-submit each entry to
 * /agent/interpret on reconnect and surface the resulting drafts in
 * the agent surface for review. We never auto-save — proposals must
 * still be approved by hand. (Spec from product.)
 *
 * Storage choice: IndexedDB rather than localStorage so we can hold
 * Blob payloads (photo/audio) directly without round-tripping through
 * base64. The schema is intentionally tiny — one object store with
 * an auto-increment key.
 */

const DB_NAME = "mitable-montessori";
const DB_VERSION = 1;
const STORE = "captures";
const CHANGE_CHANNEL = "mitable-capture-queue";
const CHANGE_EVENT = "mitable:capture-queue-changed";

export interface QueuedCapture {
    /** Auto-incremented by IDB on insert. */
    id: number;
    /** The thread the user was already inside, or null for a new
     *  thread on drain. */
    threadId: string | null;
    text: string | null;
    photo: { blob: Blob; mimeType: string } | null;
    audio: { blob: Blob; mimeType: string } | null;
    createdAt: number;
}

export type EnqueueInput = Omit<QueuedCapture, "id" | "createdAt">;

let dbPromise: Promise<IDBDatabase> | null = null;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
    if (!isBrowser()) {
        return Promise.reject(new Error("IndexedDB is not available in this environment"));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
    });
    return dbPromise;
}

function withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
    return openDb().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const tx = db.transaction(STORE, mode);
                const store = tx.objectStore(STORE);
                let result: T;
                Promise.resolve(fn(store))
                    .then((r) => {
                        result = r;
                    })
                    .catch(reject);
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"));
                tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"));
            })
    );
}

/**
 * Persist a capture for later submission. Returns the assigned id.
 * Notifies subscribers (offline pill) so the badge updates.
 */
export async function enqueueCapture(input: EnqueueInput): Promise<number> {
    const record: Omit<QueuedCapture, "id"> = {
        threadId: input.threadId,
        text: input.text,
        photo: input.photo,
        audio: input.audio,
        createdAt: Date.now(),
    };
    const id = await withStore<number>("readwrite", (store) => {
        return new Promise<number>((resolve, reject) => {
            const req = store.add(record);
            req.onsuccess = () => resolve(req.result as number);
            req.onerror = () => reject(req.error ?? new Error("Failed to enqueue capture"));
        });
    });
    notifyChange();
    return id;
}

/** Oldest-first list of all queued captures. */
export async function listCaptures(): Promise<QueuedCapture[]> {
    return withStore<QueuedCapture[]>("readonly", (store) => {
        return new Promise<QueuedCapture[]>((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const rows = (req.result as QueuedCapture[]) ?? [];
                rows.sort((a, b) => a.createdAt - b.createdAt);
                resolve(rows);
            };
            req.onerror = () => reject(req.error ?? new Error("Failed to list captures"));
        });
    });
}

export async function countCaptures(): Promise<number> {
    if (!isBrowser()) return 0;
    return withStore<number>("readonly", (store) => {
        return new Promise<number>((resolve, reject) => {
            const req = store.count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error ?? new Error("Failed to count captures"));
        });
    }).catch(() => 0);
}

export async function removeCapture(id: number): Promise<void> {
    await withStore<void>("readwrite", (store) => {
        return new Promise<void>((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error ?? new Error("Failed to remove capture"));
        });
    });
    notifyChange();
}

export async function clearCaptures(): Promise<void> {
    await withStore<void>("readwrite", (store) => {
        return new Promise<void>((resolve, reject) => {
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error ?? new Error("Failed to clear captures"));
        });
    });
    notifyChange();
}

// ─── Change notifications ─────────────────────────────────────────────
//
// The offline pill (and the drain hook in 6.3) want to react to queue
// mutations. BroadcastChannel covers cross-tab updates; the window
// CustomEvent covers same-tab subscribers in browsers without it.

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
    if (!isBrowser()) return null;
    if (channel) return channel;
    if (typeof BroadcastChannel === "undefined") return null;
    try {
        channel = new BroadcastChannel(CHANGE_CHANNEL);
    } catch {
        channel = null;
    }
    return channel;
}

function notifyChange(): void {
    if (!isBrowser()) return;
    try {
        getChannel()?.postMessage({ type: "changed", at: Date.now() });
    } catch {
        // Ignore — postMessage is best-effort.
    }
    try {
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch {
        // Ignore — older browsers without CustomEvent constructor.
    }
}

/**
 * Subscribe to queue change events. Returns an unsubscribe fn.
 */
export function subscribeToQueueChanges(handler: () => void): () => void {
    if (!isBrowser()) return () => {};

    const onMessage = () => handler();
    const ch = getChannel();
    ch?.addEventListener("message", onMessage);
    window.addEventListener(CHANGE_EVENT, onMessage);

    return () => {
        ch?.removeEventListener("message", onMessage);
        window.removeEventListener(CHANGE_EVENT, onMessage);
    };
}
