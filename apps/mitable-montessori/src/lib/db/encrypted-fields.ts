"use client";

/**
 * Helpers to encrypt/decrypt named PII columns on Roster/Guardian rows before
 * write/after read. We don't use Dexie's `creating`/`reading` hooks because they
 * are synchronous — Web Crypto is async. So callers wrap their inserts via
 * `prepareEncrypted*` and reads via `decrypt*`.
 */

import { decryptString, encryptString, nameHash } from "@/lib/crypto/encrypt";
import type { EncryptedPiiRow } from "@/lib/db/schema";
import type { GuardianRow, RosterRow } from "@/lib/db/types";

export async function prepareEncryptedRoster(row: RosterRow): Promise<EncryptedPiiRow> {
  const cipher = await encryptString(
    JSON.stringify({
      firstName: row.firstName,
      lastName: row.lastName,
      preferredName: row.preferredName ?? null,
      birthDate: row.birthDate ?? null,
      sex: row.sex ?? null,
      nicknames: row.nicknames,
      notes: row.notes ?? null,
    })
  );
  return {
    id: row.id,
    schoolId: row.schoolId,
    ciphertext: cipher,
    nameHash: row.nameHash,
  };
}

export async function decryptRoster(row: EncryptedPiiRow): Promise<RosterRow> {
  const decoded = JSON.parse(await decryptString(row.ciphertext));
  return {
    id: row.id,
    schoolId: row.schoolId,
    firstName: decoded.firstName,
    lastName: decoded.lastName,
    preferredName: decoded.preferredName,
    birthDate: decoded.birthDate,
    sex: decoded.sex ?? null,
    nicknames: decoded.nicknames ?? [],
    notes: decoded.notes,
    nameHash: row.nameHash,
  };
}

export async function prepareEncryptedGuardian(row: GuardianRow): Promise<EncryptedPiiRow> {
  const cipher = await encryptString(
    JSON.stringify({
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      preferredContactMethod: row.preferredContactMethod,
    })
  );
  return {
    id: row.id,
    schoolId: row.schoolId,
    ciphertext: cipher,
    nameHash: row.nameHash,
  };
}

export async function decryptGuardian(row: EncryptedPiiRow): Promise<GuardianRow> {
  const decoded = JSON.parse(await decryptString(row.ciphertext));
  return {
    id: row.id,
    schoolId: row.schoolId,
    firstName: decoded.firstName,
    lastName: decoded.lastName,
    email: decoded.email,
    phone: decoded.phone,
    preferredContactMethod: decoded.preferredContactMethod,
    nameHash: row.nameHash,
  };
}

export async function rosterNameHash(firstName: string, lastName: string) {
  return nameHash(firstName, lastName);
}
