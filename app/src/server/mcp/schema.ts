import z from "zod";

/**
 * Helper to convert MCP parameter schema to Zod schema
 */
export function createZodSchemaFromMCPParams(mcpParams: any): z.ZodObject<any> {
  // If no parameters or invalid format, return empty object schema
  if (!mcpParams || typeof mcpParams !== "object") {
    return z.object({}).describe("No parameters needed");
  }

  // For JSON Schema format (most common in MCP)
  if (mcpParams.properties) {
    const zodObj: Record<string, z.ZodTypeAny> = {};
    const required = mcpParams.required || [];

    Object.entries(mcpParams.properties).forEach(([name, propValue]) => {
      const prop = propValue as any;
      let zodType: z.ZodTypeAny;

      // Convert JSON Schema types to Zod types
      switch (prop.type) {
        case "string":
          zodType = z.string();
          break;
        case "number":
        case "integer":
          zodType = z.number();
          break;
        case "boolean":
          zodType = z.boolean();
          break;
        case "array":
          // For arrays, create a simple array of any type if item type is not specified
          zodType = z.array(z.any());
          // TODO: Handle array item types if needed
          break;
        case "object":
          // For objects, create a simple record if properties are not specified
          zodType = z.record(z.any());
          // TODO: Handle nested object schemas if needed
          break;
        default:
          zodType = z.any();
      }

      // Add description if available
      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      // Make optional if not required
      if (!required.includes(name)) {
        zodType = zodType.optional();
      }

      zodObj[name] = zodType;
    });

    return z.object(zodObj);
  }

  // Fallback for unknown schema format
  return z.object({}).describe("Parameters in unknown format");
}
