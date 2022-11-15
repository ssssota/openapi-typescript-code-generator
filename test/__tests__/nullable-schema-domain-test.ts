import * as fs from "fs";
import * as path from "path";

import * as Utils from "../utils";

describe("Nullable", () => {
  test("client.ts", () => {
    const generateCode = fs.readFileSync("test/code/nullable.schema.domain/client.ts", { encoding: "utf-8" });
    const text = Utils.replaceVersionInfo(generateCode);
    expect(text).toMatchSnapshot();
  });
});