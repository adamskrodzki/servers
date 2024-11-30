import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { ReadMultipleFilesArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function readMultipleFiles(args: unknown, allowedDirectories: string[]) {
  const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
    throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
  }
  
  const results = await Promise.all(
    parsed.data.paths.map(async (filePath: string) => {
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const content = await fs.readFile(validPath, "utf-8");
        logger.info(`Successfully read file: ${validPath}`);
        return `${filePath}:\n${content}\n`;
      } catch (error) {
        logger.error(`Error reading file ${filePath}: ${error}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `${filePath}: Error - ${errorMessage}`;
      }
    }),
  );
  
  return {
    content: [{ type: "text", text: results.join("\n---\n") }],
  };
}
