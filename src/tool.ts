import { z } from 'zod';
import type { Tool, ToolDefinition, ToolSchema } from './types';

/**
 * Convert a Zod schema to JSON Schema format for LLM providers
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const processSchema = (s: z.ZodType): Record<string, unknown> => {
    const typeName = s._def.typeName;

    switch (typeName) {
      case 'ZodString': {
        const stringSchema: Record<string, unknown> = { type: 'string' };
        const def = s._def as z.ZodStringDef;
        if (def.description) stringSchema.description = def.description;
        for (const check of def.checks) {
          if (check.kind === 'min') stringSchema.minLength = check.value;
          if (check.kind === 'max') stringSchema.maxLength = check.value;
          if (check.kind === 'regex') stringSchema.pattern = check.regex.source;
          if (check.kind === 'email') stringSchema.format = 'email';
          if (check.kind === 'url') stringSchema.format = 'uri';
          if (check.kind === 'datetime') stringSchema.format = 'date-time';
        }
        return stringSchema;
      }

      case 'ZodNumber': {
        const numSchema: Record<string, unknown> = { type: 'number' };
        const def = s._def as z.ZodNumberDef;
        if (def.description) numSchema.description = def.description;
        for (const check of def.checks) {
          if (check.kind === 'min') numSchema.minimum = check.value;
          if (check.kind === 'max') numSchema.maximum = check.value;
          if (check.kind === 'int') numSchema.type = 'integer';
        }
        return numSchema;
      }

      case 'ZodBoolean': {
        const boolSchema: Record<string, unknown> = { type: 'boolean' };
        if (s._def.description) boolSchema.description = s._def.description;
        return boolSchema;
      }

      case 'ZodArray': {
        const def = s._def as z.ZodArrayDef;
        const arraySchema: Record<string, unknown> = {
          type: 'array',
          items: processSchema(def.type),
        };
        if (def.description) arraySchema.description = def.description;
        if (def.minLength !== null) arraySchema.minItems = def.minLength.value;
        if (def.maxLength !== null) arraySchema.maxItems = def.maxLength.value;
        return arraySchema;
      }

      case 'ZodObject': {
        const def = s._def as z.ZodObjectDef;
        const shape = def.shape();
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as z.ZodType;
          properties[key] = processSchema(fieldSchema);

          // Check if field is required (not optional and no default)
          if (
            fieldSchema._def.typeName !== 'ZodOptional' &&
            fieldSchema._def.typeName !== 'ZodDefault'
          ) {
            required.push(key);
          }
        }

        const objSchema: Record<string, unknown> = {
          type: 'object',
          properties,
        };
        if (required.length > 0) objSchema.required = required;
        if (def.description) objSchema.description = def.description;
        return objSchema;
      }

      case 'ZodEnum': {
        const def = s._def as z.ZodEnumDef;
        const enumSchema: Record<string, unknown> = {
          type: 'string',
          enum: def.values,
        };
        if (def.description) enumSchema.description = def.description;
        return enumSchema;
      }

      case 'ZodOptional': {
        const def = s._def as z.ZodOptionalDef;
        return processSchema(def.innerType);
      }

      case 'ZodDefault': {
        const def = s._def as z.ZodDefaultDef;
        const innerSchema = processSchema(def.innerType);
        innerSchema.default = def.defaultValue();
        return innerSchema;
      }

      case 'ZodNullable': {
        const def = s._def as z.ZodNullableDef;
        const innerSchema = processSchema(def.innerType);
        return {
          oneOf: [innerSchema, { type: 'null' }],
        };
      }

      case 'ZodUnion': {
        const def = s._def as z.ZodUnionDef;
        return {
          oneOf: def.options.map((opt: z.ZodType) => processSchema(opt)),
        };
      }

      case 'ZodLiteral': {
        const def = s._def as z.ZodLiteralDef;
        return { const: def.value };
      }

      default:
        return { type: 'string' };
    }
  };

  return processSchema(schema);
}

/**
 * Define a type-safe tool with Zod schema validation
 */
export function defineTool<TParams extends z.ZodType>(
  definition: ToolDefinition<TParams>
): Tool<TParams> {
  const { name, description, parameters, execute } = definition;

  // Validate name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid tool name "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }

  // Wrap execute with validation
  const validatedExecute = async (params: z.infer<TParams>): Promise<unknown> => {
    const parsed = parameters.parse(params);
    return execute(parsed);
  };

  const toJSON = (): ToolSchema => ({
    type: 'function',
    function: {
      name,
      description,
      parameters: zodToJsonSchema(parameters),
    },
  });

  return {
    name,
    description,
    parameters,
    execute: validatedExecute,
    toJSON,
  };
}

/**
 * Create a tool with a simple function (no Zod schema)
 */
export function createSimpleTool(config: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}): Tool {
  const schema = z.object({}).passthrough();

  return {
    name: config.name,
    description: config.description,
    parameters: schema,
    execute: config.execute,
    toJSON: () => ({
      type: 'function',
      function: {
        name: config.name,
        description: config.description,
        parameters: {
          type: 'object',
          properties: config.parameters,
        },
      },
    }),
  };
}
