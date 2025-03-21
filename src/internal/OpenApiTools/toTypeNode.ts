import ts from "typescript";

import type { OpenApi } from "../../types";
import { UnSupportError } from "../Exception";
import * as Logger from "../Logger";
import { Factory } from "../TsGenerator";
import * as ConverterContext from "./ConverterContext";
import * as Guard from "./Guard";
import * as InferredType from "./InferredType";
import * as Reference from "./components/Reference";
import { ObjectSchemaWithAdditionalProperties } from "./types";

export interface ResolveReferencePath {
  name: string;
  maybeResolvedName: string;
  unresolvedPaths: string[];
  /**
   * @example components.a.b.c.dの場合 ["a", "b", "c", "d"].length = 4
   **/
  depth: number;
  /**
   * Input $ref divided by / (except #)
   */
  pathArray: string[];
}

export interface Context {
  readonly rootSchema: OpenApi.Document;
  setReferenceHandler: (currentPoint: string, reference: Reference.Type<OpenApi.Schema | OpenApi.JSONSchemaDefinition>) => void;
  resolveReferencePath: (currentPoint: string, referencePath: string) => ResolveReferencePath;
  findSchemaByPathArray: (paths: string[]) => OpenApi.Schema | OpenApi.Reference | OpenApi.JSONSchemaDefinition;
}

export type Convert = (
  entryPoint: string,
  currentPoint: string,
  factory: Factory.Type,
  schema: OpenApi.Schema | OpenApi.Reference | OpenApi.JSONSchemaDefinition,
  setReference: Context,
  convertContext: ConverterContext.Types,
  option?: Option,
) => ts.TypeNode;

export interface Option {
  parent?: any;
}

export const generateMultiTypeNode = (
  entryPoint: string,
  currentPoint: string,
  factory: Factory.Type,
  schemas: OpenApi.JSONSchema[],
  setReference: Context,
  convert: Convert,
  convertContext: ConverterContext.Types,
  multiType: "oneOf" | "allOf" | "anyOf",
): ts.TypeNode => {
  const typeNodes = schemas.map(schema => convert(entryPoint, currentPoint, factory, schema, setReference, convertContext));
  if (multiType === "oneOf") {
    return factory.UnionTypeNode.create({
      typeNodes,
    });
  }
  if (multiType === "allOf") {
    return factory.IntersectionTypeNode.create({
      typeNodes,
    });
  }
  /**
   * If you see this comment and have an idea for an AnyOf type output, please submit an Issue.
   */
  return factory.UnionTypeNode.create({
    typeNodes,
  });
};

const nullable = (factory: Factory.Type, typeNode: ts.TypeNode, nullable: boolean): ts.TypeNode => {
  if (nullable) {
    return factory.UnionTypeNode.create({
      typeNodes: [
        typeNode,
        factory.TypeNode.create({
          type: "null",
        }),
      ],
    });
  }
  return typeNode;
};

export const convert: Convert = (
  entryPoint: string,
  currentPoint: string,
  factory: Factory.Type,
  schema: OpenApi.Schema | OpenApi.Reference | OpenApi.JSONSchemaDefinition,
  context: Context,
  converterContext: ConverterContext.Types,
  option?: Option,
): ts.TypeNode => {
  if (typeof schema === "boolean") {
    // https://swagger.io/docs/specification/data-models/dictionaries/#free-form
    return factory.TypeNode.create({
      type: "object",
      value: [],
    });
  }
  if (Guard.isReference(schema)) {
    const reference = Reference.generate<OpenApi.Schema | OpenApi.JSONSchemaDefinition>(entryPoint, currentPoint, schema);
    if (reference.type === "local") {
      // Type Aliasを作成 (or すでにある場合は作成しない)
      context.setReferenceHandler(currentPoint, reference);
      const { maybeResolvedName, depth, pathArray } = context.resolveReferencePath(currentPoint, reference.path);
      if (depth === 2) {
        return factory.TypeReferenceNode.create({ name: converterContext.escapeReferenceDeclarationText(maybeResolvedName) });
      }
      const resolveSchema = context.findSchemaByPathArray(pathArray);
      return convert(entryPoint, currentPoint, factory, resolveSchema, context, converterContext, { parent: schema });
    }
    // サポートしているディレクトリに対して存在する場合
    if (reference.componentName) {
      // Type AliasもしくはInterfaceを作成
      context.setReferenceHandler(currentPoint, reference);
      // Aliasを貼る
      return factory.TypeReferenceNode.create({ name: context.resolveReferencePath(currentPoint, reference.path).name });
    }
    // サポートしていないディレクトリに存在する場合、直接Interface、もしくはTypeAliasを作成
    return convert(entryPoint, reference.referencePoint, factory, reference.data, context, converterContext, { parent: schema });
  }

  if (Guard.isOneOfSchema(schema)) {
    return nullable(
      factory,
      generateMultiTypeNode(entryPoint, currentPoint, factory, schema.oneOf, context, convert, converterContext, "oneOf"),
      !!schema.nullable,
    );
  }
  if (Guard.isAllOfSchema(schema)) {
    return nullable(
      factory,
      generateMultiTypeNode(entryPoint, currentPoint, factory, schema.allOf, context, convert, converterContext, "allOf"),
      !!schema.nullable,
    );
  }
  if (Guard.isAnyOfSchema(schema)) {
    return nullable(
      factory,
      generateMultiTypeNode(entryPoint, currentPoint, factory, schema.anyOf, context, convert, converterContext, "anyOf"),
      !!schema.nullable,
    );
  }

  if (Guard.isHasNoMembersObject(schema)) {
    return factory.TypeNode.create({
      type: "object",
      value: [],
    });
  }

  // schema.type
  if (!schema.type) {
    const inferredSchema = InferredType.getInferredType(schema);
    if (inferredSchema) {
      return convert(entryPoint, currentPoint, factory, inferredSchema, context, converterContext, { parent: schema });
    }
    // typeを指定せずに、nullableのみを指定している場合に type object変換する
    if (typeof schema.nullable === "boolean") {
      const typeNode = factory.TypeNode.create({
        type: "any",
      });
      return nullable(factory, typeNode, schema.nullable);
    }
    if (option?.parent) {
      const message = [
        "Schema Type is not found and is converted to the type any. The parent Schema is as follows.",
        "",
        JSON.stringify(option.parent),
        "",
      ].join("\n");
      Logger.info(message);
    }
    const typeNode = factory.TypeNode.create({
      type: "any",
    });
    return typeNode;
    // Logger.showFilePosition(entryPoint, currentPoint);
    // throw new UnsetTypeError("Please set 'type' or '$ref' property \n" + JSON.stringify(schema));
  }
  switch (schema.type) {
    case "boolean": {
      const items = schema.enum;
      let typeNode: ts.TypeNode;
      if (items && Guard.isBooleanArray(items)) {
        typeNode = factory.TypeNode.create({
          type: schema.type,
          enum: items,
        });
      } else {
        typeNode = factory.TypeNode.create({
          type: schema.type,
        });
      }
      return nullable(factory, typeNode, !!schema.nullable);
    }
    case "null": {
      return factory.TypeNode.create({
        type: schema.type,
      });
    }
    case "integer":
    case "number": {
      const items = schema.enum;
      let typeNode: ts.TypeNode;
      const formatTypeNode = converterContext.convertFormatTypeNode(schema);
      if (formatTypeNode) {
        return formatTypeNode;
      }
      if (items && Guard.isNumberArray(items)) {
        typeNode = factory.TypeNode.create({
          type: schema.type,
          enum: items,
        });
      } else {
        typeNode = factory.TypeNode.create({
          type: schema.type,
        });
      }
      return nullable(factory, typeNode, !!schema.nullable);
    }
    case "string": {
      const items = schema.enum;
      const formatTypeNode = converterContext.convertFormatTypeNode(schema);
      if (formatTypeNode) {
        return formatTypeNode;
      }
      let typeNode: ts.TypeNode;
      if (items && Guard.isStringArray(items)) {
        typeNode = factory.TypeNode.create({
          type: schema.type,
          enum: items,
        });
      } else {
        typeNode = factory.TypeNode.create({
          type: schema.type,
        });
      }
      return nullable(factory, typeNode, !!schema.nullable);
    }
    case "array": {
      if (Array.isArray(schema.items) || typeof schema.items === "boolean") {
        throw new UnSupportError(`schema.items = ${JSON.stringify(schema.items)}`);
      }
      const typeNode = factory.TypeNode.create({
        type: schema.type,
        value: schema.items
          ? convert(entryPoint, currentPoint, factory, schema.items, context, converterContext, { parent: schema })
          : factory.TypeNode.create({
              type: "undefined",
            }),
      });
      return nullable(factory, typeNode, !!schema.nullable);
    }
    case "object": {
      const required: string[] = schema.required || [];
      // // https://swagger.io/docs/specification/data-models/dictionaries/#free-form
      if (schema.additionalProperties === true) {
        return factory.TypeNode.create({
          type: schema.type,
          value: [],
        });
      }

      const value: ts.PropertySignature[] = Object.entries(schema.properties || {}).map(([name, jsonSchema]) => {
        return factory.PropertySignature.create({
          readOnly: typeof jsonSchema !== "boolean" ? !!jsonSchema.readOnly : false,
          name: converterContext.escapePropertySignatureName(name),
          type: convert(entryPoint, currentPoint, factory, jsonSchema, context, converterContext, { parent: schema.properties }),
          optional: !required.includes(name),
          comment: typeof jsonSchema !== "boolean" ? jsonSchema.description : undefined,
        });
      });
      if (schema.additionalProperties) {
        const additionalProperties = factory.IndexSignatureDeclaration.create({
          name: "key",
          type: convert(entryPoint, currentPoint, factory, schema.additionalProperties, context, converterContext, {
            parent: schema.properties,
          }),
        });

        const hasOptionalProperty = Object.keys(schema.properties || {}).some(key => !required.includes(key));
        if (hasOptionalProperty) {
          const objectTypeNode = factory.TypeNode.create({
            type: schema.type,
            value: value,
          });
          const additionalObjectTypeNode = factory.TypeNode.create({
            type: schema.type,
            value: [additionalProperties],
          });
          return factory.IntersectionTypeNode.create({
            typeNodes: [objectTypeNode, additionalObjectTypeNode],
          });
        }
        return factory.TypeNode.create({
          type: schema.type,
          value: [...value, additionalProperties],
        });
      }
      const typeNode = factory.TypeNode.create({
        type: schema.type,
        value,
      });
      return nullable(factory, typeNode, !!schema.nullable);
    }
    default:
      return factory.TypeNode.create({
        type: "any",
      });
    // throw new UnknownError("what is this? \n" + JSON.stringify(schema, null, 2));
  }
};

export const convertAdditionalProperties = (
  entryPoint: string,
  currentPoint: string,
  factory: Factory.Type,
  schema: ObjectSchemaWithAdditionalProperties,
  setReference: Context,
  convertContext: ConverterContext.Types,
): ts.IndexSignatureDeclaration => {
  // // https://swagger.io/docs/specification/data-models/dictionaries/#free-form
  if (schema.additionalProperties === true) {
    factory.TypeNode.create({
      type: schema.type,
      value: [],
    });
  }
  const additionalProperties = factory.IndexSignatureDeclaration.create({
    name: "key",
    type: convert(entryPoint, currentPoint, factory, schema.additionalProperties, setReference, convertContext, {
      parent: schema.properties,
    }),
  });
  return additionalProperties;
};
