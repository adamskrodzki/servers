import { zodToJsonSchema } from "zod-to-json-schema";
import { ReadMultipleFilesArgsSchema } from "../../schemas.js";
import { ToolDefinition } from "../types.js";

export const readMultipleFilesToolDefinition: ToolDefinition = {
  name: "read_multiple_files",
  description:
    "Read the contents of multiple files simultaneously. This is more " +
    "efficient than reading files one by one when you need to analyze " +
    "or compare multiple files. Each file's content is returned with its " +
    "path as a reference. Failed reads for individual files won't stop " +
    "the entire operation. Only works within allowed directories.",
  inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema),
};