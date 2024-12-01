import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { ReadFileArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function readFile(args: unknown, allowedDirectories: string[]) {
  const parsed = ReadFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for read_file: ${parsed.error}`);
    throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const content = await fs.readFile(validPath, "utf-8");
  logger.info(`Successfully read file: ${validPath}`);
  return {
    content: [{ type: "text", text: content }],
  };
}
