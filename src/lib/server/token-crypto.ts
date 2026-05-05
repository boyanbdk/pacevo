import crypto from "node:crypto";
import { requiredEnv } from "./env";

const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  return crypto
    .createHash("sha256")
    .update(requiredEnv("TOKEN_ENCRYPTION_SECRET"))
    .digest();
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(value: string): string {
  const [ivText, authTagText, encryptedText] = value.split(".");
  if (!ivText || !authTagText || !encryptedText) {
    throw new Error("Invalid encrypted token format.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

