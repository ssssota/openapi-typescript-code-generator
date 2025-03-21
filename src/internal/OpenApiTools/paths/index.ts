import ts from "typescript";

import type { OpenApi } from "../../../types";
import { Factory } from "../../TsGenerator";
import * as ConverterContext from "../ConverterContext";
import * as Guard from "../Guard";
import type * as Walker from "../Walker";
import * as PathItem from "../components/PathItem";
import * as Reference from "../components/Reference";
import * as ToTypeNode from "../toTypeNode";

export const generateStatements = (
  entryPoint: string,
  currentPoint: string,
  store: Walker.Store,
  factory: Factory.Type,
  paths: OpenApi.Paths,
  context: ToTypeNode.Context,
  converterContext: ConverterContext.Types,
): void => {
  const statements: ts.Statement[][] = [];
  for (const [requestUri, pathItem] of Object.entries(paths)) {
    if (!requestUri.startsWith("/")) {
      throw new Error(`Not start slash: ${requestUri}`);
    }
    if (Guard.isReference(pathItem)) {
      const reference = Reference.generate<OpenApi.PathItem>(entryPoint, currentPoint, pathItem);
      if (reference.type === "local") {
        statements.push(
          PathItem.generateStatements(
            entryPoint,
            currentPoint,
            store,
            factory,
            requestUri,
            store.getPathItem(reference.path),
            context,
            converterContext,
          ),
        );
      } else {
        statements.push(
          PathItem.generateStatements(
            entryPoint,
            reference.referencePoint,
            store,
            factory,
            requestUri,
            reference.data,
            context,
            converterContext,
          ),
        );
      }
    } else {
      statements.push(PathItem.generateStatements(entryPoint, currentPoint, store, factory, requestUri, pathItem, context, converterContext));
    }
  }

  store.addAdditionalStatement(statements.flat());
};
