import { zodToJsonSchema } from "zod-to-json-schema";
import { ReadFileArgsSchema } from "../../schemas.js";
import { ToolDefinition } from "../types.js";

export const readFileToolDefinition: ToolDefinition = {
  name: "read_file",
  description:
    "Read the complete contents of a file from the file system. " +
    "Handles various text encodings and provides detailed error messages " +
    "if the file cannot be read. Use this tool when you need to examine " +
    "the contents of a single file. Only works within allowed directories.",
  inputSchema: zodToJsonSchema(ReadFileArgsSchema),
};