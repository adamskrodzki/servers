import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { WriteFileArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function writeFile(args: unknown, allowedDirectories: string[]) {
  const parsed = WriteFileArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for write_file: ${parsed.error}`);
    throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  await fs.writeFile(validPath, parsed.data.content, "utf-8");
  logger.info(`Successfully wrote to file: ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
  };
}
