import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { CreateDirectoryArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function createDirectory(args: unknown, allowedDirectories: string[]) {
  const parsed = CreateDirectoryArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for create_directory: ${parsed.error}`);
    throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  await fs.mkdir(validPath, { recursive: true });
  logger.info(`Successfully created directory: ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
  };
}
