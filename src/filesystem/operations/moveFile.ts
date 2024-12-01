import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { MoveFileArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function moveFile(args: unknown, allowedDirectories: string[]) {
  const parsed = MoveFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for move_file: ${parsed.error}`);
    throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
  }
  const validSourcePath = await validatePath(parsed.data.source, allowedDirectories);
  const validDestPath = await validatePath(parsed.data.destination, allowedDirectories);
  await fs.rename(validSourcePath, validDestPath);
  logger.info(`Successfully moved file from ${validSourcePath} to ${validDestPath}`);
  return {
    content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
  };
}
