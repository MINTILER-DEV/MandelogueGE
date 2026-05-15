import { describe, expect, it } from "vitest";
import { readScriptEditableValues, updateScriptEditableValue } from "./script-properties.js";

describe("script-properties", () => {
  it("reads editable values from exported bindings and class fields", () => {
    const source = `
export const title = "Runner";

export default class PlayerController {
  speed = 220;
  enabled = true;
}
`;

    expect(readScriptEditableValues(source)).toEqual({
      enabled: true,
      speed: 220,
      title: "Runner"
    });
  });

  it("updates a class field initializer without disturbing the rest of the file", () => {
    const source = `
export default class PlayerController {
  speed = 220;
  enabled = true;
}
`;

    expect(updateScriptEditableValue(source, "speed", 360)).toContain("speed = 360;");
    expect(updateScriptEditableValue(source, "enabled", false)).toContain("enabled = false;");
  });

  it("updates an exported variable initializer", () => {
    const source = `export const title = "Runner";\n`;
    expect(updateScriptEditableValue(source, "title", "Walker")).toBe(`export const title = "Walker";\n`);
  });
});
