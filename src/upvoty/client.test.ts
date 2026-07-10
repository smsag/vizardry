/**
 * Tests for upvoty/client.ts's base62 -> UUID slug conversion.
 *
 * toUuid decodes a base62 URL slug by accumulating it into a BigInt and
 * zero-padding the resulting hex string back out to 32 chars. This is
 * correct: leading zero-value characters in the slug don't change the
 * decoded numeric value (same as "007" === "7" in decimal), and the
 * padStart restores whatever leading zero bytes the original UUID had.
 */

import { describe, it, expect } from "vitest";
import { toUuid } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("toUuid", () => {
  it("passes an already-formatted UUID through unchanged", () => {
    const uuid = "5ffcaa11-2233-4455-6677-8899aabbccdd";
    expect(toUuid(uuid)).toBe(uuid);
  });

  it("passes through unrecognised characters instead of throwing", () => {
    expect(toUuid("not-base62!")).toBe("not-base62!");
  });

  it("decodes a base62 slug to a well-formed UUID", () => {
    const result = toUuid("5OdEIWLP5WQ1B2z7TnjE1o");
    expect(result).toMatch(UUID_RE);
  });

  it("round-trips a UUID with leading zero bytes through an unpadded base62 encoding", () => {
    // Naive base62 encoding of a big integer (no left-padding) — this is
    // what a UUID with leading zero bytes would naturally produce, since
    // positional notation omits leading zero digits.
    const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    function encodeNaive(hex: string): string {
      let n = BigInt(`0x${hex}`);
      if (n === BigInt(0)) return "0";
      let s = "";
      while (n > BigInt(0)) { s = B62[Number(n % BigInt(62))] + s; n = n / BigInt(62); }
      return s;
    }

    const originalHex = "00abcdef123445667788990011223344";
    const slug = encodeNaive(originalHex);
    expect(slug.length).toBeLessThan(32); // shorter than a fully-padded encoding

    const decoded = toUuid(slug).replace(/-/g, "");
    expect(decoded).toBe(originalHex);
  });

  it("decodes identically whether or not the slug carries an explicit leading zero pad", () => {
    // Both forms represent the same numeric value/UUID — decoding must
    // agree, since the padding character carries no independent meaning.
    expect(toUuid("0ABCDEFGH12345678901z")).toBe(toUuid("ABCDEFGH12345678901z"));
  });
});
