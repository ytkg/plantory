import { describe, expect, it } from "vitest";
import { formatDateTime } from "../public/ui.js";

describe("formatDateTime", () => {
  it("formats both legacy D1 timestamps and explicit UTC timestamps", () => {
    expect(formatDateTime("2026-09-06 21:00:11")).toBe("9/7 06:00");
    expect(formatDateTime("2026-09-06T21:00:11Z")).toBe("9/7 06:00");
  });
});
