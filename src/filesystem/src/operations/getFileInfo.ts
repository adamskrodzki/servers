import { validatePath, getFileStats } from "../utils.js";
import { GetFileInfoArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function getFileInfo(args: unknown, allowedDirectories: string[]) {
  const parsed = GetFileInfoArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for get_file_info: ${parsed.error}`);
    throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const info = await getFileStats(validPath);
  logger.info(`Successfully got file info for: ${validPath}`);
  return {
    content: [{ type: "text", text: Object.entries(info)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n") }],
  };
}
