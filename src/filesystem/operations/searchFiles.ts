import { validatePath, searchFiles as searchFilesUtil } from "../utils.js";
import { SearchFilesArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function searchFiles(args: unknown, allowedDirectories: string[]) {
  const parsed = SearchFilesArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for search_files: ${parsed.error}`);
    throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
  }
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const results = await searchFilesUtil(validPath, parsed.data.pattern, allowedDirectories);
  logger.info(`Successfully searched files in ${validPath} for pattern: ${parsed.data.pattern}`);
  return {
    content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
  };
}
