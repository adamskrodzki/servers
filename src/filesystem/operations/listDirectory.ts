import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { ListDirectoryArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function listDirectory(args: unknown, allowedDirectories: string[]) {
  const parsed = ListDirectoryArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for list_directory: ${parsed.error}`);
    throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const entries = await fs.readdir(validPath, { withFileTypes: true });
  const formatted = entries
    .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
    .join("\n");
  logger.info(`Successfully listed directory: ${validPath}`);
  return {
    content: [{ type: "text", text: formatted }],
  };
}
