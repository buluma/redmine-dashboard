import { describe, expect, it } from "vitest";
import { encryptText, decryptText } from "@/src/lib/crypto";

describe("crypto utilities", () => {
  describe("encryptText / decryptText", () => {
    it("encrypts and decrypts text successfully", () => {
      const original = "secret-api-key-123";
      const { encrypted, iv } = encryptText(original);
      const decrypted = decryptText(encrypted, iv);

      expect(decrypted).toBe(original);
    });

    it("produces different ciphertext for same plaintext (random IV)", () => {
      const plaintext = "same-text-every-time";
      const result1 = encryptText(plaintext);
      const result2 = encryptText(plaintext);

      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);

      // But both should decrypt to the same value
      expect(decryptText(result1.encrypted, result1.iv)).toBe(plaintext);
      expect(decryptText(result2.encrypted, result2.iv)).toBe(plaintext);
    });

    it("handles empty string", () => {
      const { encrypted, iv } = encryptText("");
      const decrypted = decryptText(encrypted, iv);

      expect(decrypted).toBe("");
    });

    it("handles unicode characters", () => {
      const original = "Hello 世界 🌍";
      const { encrypted, iv } = encryptText(original);
      const decrypted = decryptText(encrypted, iv);

      expect(decrypted).toBe(original);
    });

    it("handles long strings", () => {
      const original = "a".repeat(10000);
      const { encrypted, iv } = encryptText(original);
      const decrypted = decryptText(encrypted, iv);

      expect(decrypted).toBe(original);
    });

    it("returns base64-encoded values", () => {
      const { encrypted, iv } = encryptText("test");

      // Base64 regex pattern
      const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
      expect(encrypted).toMatch(base64Pattern);
      expect(iv).toMatch(base64Pattern);
    });

    it("fails to decrypt with wrong IV", () => {
      const { encrypted } = encryptText("secret");
      const wrongIv = encryptText("other").iv;

      expect(() => decryptText(encrypted, wrongIv)).toThrow();
    });

    it("fails to decrypt with tampered data", () => {
      const { encrypted, iv } = encryptText("secret");
      const tampered = encrypted.slice(0, -10) + "AAAAAA";

      expect(() => decryptText(tampered, iv)).toThrow();
    });
  });
});
