import ts from "typescript";

import { TsGenerator } from "../../api";
import type { CodeGenerator } from "../../types";
import * as ApiClientArgument from "../_shared/ApiClientArgument";
import * as ApiClientInterface from "../_shared/ApiClientInterface";
import * as FunctionalApiClient from "./FunctionalApiClient";

import type { Option } from "../_shared/types";

export { Option };

export const generator: CodeGenerator.GenerateFunction<Option> = (
  codeGeneratorParamsList: CodeGenerator.Params[],
  option?: Option,
): CodeGenerator.IntermediateCode[] => {
  const statements: ts.Statement[] = [];
  const factory = TsGenerator.Factory.create();
  codeGeneratorParamsList.forEach(codeGeneratorParams => {
    const { convertedParams } = codeGeneratorParams;
    if (convertedParams.hasRequestBody) {
      statements.push(ApiClientArgument.createRequestContentTypeReference(factory, codeGeneratorParams));
    }
    if (convertedParams.responseSuccessNames.length > 0) {
      statements.push(ApiClientArgument.createResponseContentTypeReference(factory, codeGeneratorParams));
    }
    const typeDeclaration = ApiClientArgument.create(factory, codeGeneratorParams);
    if (typeDeclaration) {
      statements.push(typeDeclaration);
    }
  });

  ApiClientInterface.create(factory, codeGeneratorParamsList, "currying-function", option || {}).forEach(statement => {
    statements.push(statement);
  });

  const apiClientStatements = FunctionalApiClient.create(factory, codeGeneratorParamsList, option || {});
  apiClientStatements.forEach(apiClientStatement => {
    statements.push(apiClientStatement);
  });

  return statements;
};
