import crypto from "node:crypto";
import { env } from "@/src/lib/env";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const key = Buffer.from(env.encryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be base64-encoded 32 bytes");
  }
  return key;
}

export function encryptText(plainText: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptText(encrypted: string, iv: string): string {
  const data = Buffer.from(encrypted, "base64");
  const ivBuf = Buffer.from(iv, "base64");
  const content = data.subarray(0, data.length - 16);
  const authTag = data.subarray(data.length - 16);

  const decipher = crypto.createDecipheriv(ALGO, getKey(), ivBuf);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString("utf8");
}
