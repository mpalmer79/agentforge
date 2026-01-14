import { z } from 'zod';
import type { Tool, ToolDefinition, ToolSchema } from './types';

/**
 * Extended type for accessing Zod internals
 */
interface ZodDefWithType {
  typeName: string;
  description?: string;
  checks?: Array<{ kind: string; value?: unknown; regex?: RegExp }>;
  type?: z.ZodType;
  innerType?: z.ZodType;
  shape?: () => Record<string, z.ZodType>;
  values?: string[];
  options?: z.ZodType[];
  value?: unknown;
  defaultValue?: () => unknown;
  minLength?: { value: number } | null;
  maxLength?: { value: number } | null;
}

/**
 * Convert a Zod schema to JSON Schema format for LLM providers
 */
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const processSchema = (s: z.ZodType): Record<string, unknown> => {
    const def = s._def as ZodDefWithType;
    const typeName = def.typeName;

    switch (typeName) {
      case 'ZodString': {
        const stringSchema: Record<string, unknown> = { type: 'string' };
        if (def.description) stringSchema.description = def.description;
        if (def.checks) {
          for (const check of def.checks) {
            if (check.kind === 'min') stringSchema.minLength = check.value;
            if (check.kind === 'max') stringSchema.maxLength = check.value;
            if (check.kind === 'regex' && check.regex) stringSchema.pattern = check.regex.source;
            if (check.kind === 'email') stringSchema.format = 'email';
            if (check.kind === 'url') stringSchema.format = 'uri';
            if (check.kind === 'datetime') stringSchema.format = 'date-time';
          }
        }
        return stringSchema;
      }

      case 'ZodNumber': {
        const numSchema: Record<string, unknown> = { type: 'number' };
        if (def.description) numSchema.description = def.description;
        if (def.checks) {
          for (const check of def.checks) {
            if (check.kind === 'min') numSchema.minimum = check.value;
            if (check.kind === 'max') numSchema.maximum = check.value;
            if (check.kind === 'int') numSchema.type = 'integer';
          }
        }
        return numSchema;
      }

      case 'ZodBoolean': {
        const boolSchema: Record<string, unknown> = { type: 'boolean' };
        if (def.description) boolSchema.description = def.description;
        return boolSchema;
      }

      case 'ZodArray': {
        const arraySchema: Record<string, unknown> = {
          type: 'array',
          items: def.type ? processSchema(def.type) : { type: 'string' },
        };
        if (def.description) arraySchema.description = def.description;
        if (def.minLength !== null && def.minLength !== undefined) {
          arraySchema.minItems = def.minLength.value;
        }
        if (def.maxLength !== null && def.maxLength !== undefined) {
          arraySchema.maxItems = def.maxLength.value;
        }
        return arraySchema;
      }

      case 'ZodObject': {
        const shape = def.shape ? def.shape() : {};
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as z.ZodType;
          const fieldDef = fieldSchema._def as ZodDefWithType;
          properties[key] = processSchema(fieldSchema);

          if (fieldDef.typeName !== 'ZodOptional' && fieldDef.typeName !== 'ZodDefault') {
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
        const enumSchema: Record<string, unknown> = {
          type: 'string',
          enum: def.values || [],
        };
        if (def.description) enumSchema.description = def.description;
        return enumSchema;
      }

      case 'ZodOptional': {
        return def.innerType ? processSchema(def.innerType) : { type: 'string' };
      }

      case 'ZodDefault': {
        const innerSchema = def.innerType ? processSchema(def.innerType) : { type: 'string' };
        if (def.defaultValue) {
          innerSchema.default = def.defaultValue();
        }
        return innerSchema;
      }

      case 'ZodNullable': {
        const innerSchema = def.innerType ? processSchema(def.innerType) : { type: 'string' };
        return {
          oneOf: [innerSchema, { type: 'null' }],
        };
      }

      case 'ZodUnion': {
        return {
          oneOf: (def.options || []).map((opt: z.ZodType) => processSchema(opt)),
        };
      }

      case 'ZodLiteral': {
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

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid tool name "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }

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
