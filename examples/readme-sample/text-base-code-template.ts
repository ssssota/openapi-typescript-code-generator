import * as Types from "@himenon/openapi-typescript-code-generator/dist/types";

interface Option {
  showLog?: boolean;
}

const generator: Types.CodeGenerator.GenerateFunction<Option> = (payload: Types.CodeGenerator.Params[], option): string[] => {
  if (option?.showLog) {
    console.log("show log message");
  }
  return ["Hello world"];
};

const customGenerator: Types.CodeGenerator.CustomGenerator<Option> = {
  generator: generator,
  option: {},
};
