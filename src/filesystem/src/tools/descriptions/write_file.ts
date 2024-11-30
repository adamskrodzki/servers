import { zodToJsonSchema } from "zod-to-json-schema";
import { WriteFileArgsSchema } from "../../schemas.js";
import { ToolDefinition } from "../types.js";

export const writeFileToolDefinition: ToolDefinition = {
  name: "write_file",
  description:
    "Create a new file or completely overwrite an existing file with new content. " +
    "Use with caution as it will overwrite existing files without warning. " +
    "Handles text content with proper encoding. Only works within allowed directories.",
  inputSchema: zodToJsonSchema(WriteFileArgsSchema),
};