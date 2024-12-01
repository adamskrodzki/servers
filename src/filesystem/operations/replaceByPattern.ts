import fs from "fs/promises";
import { validatePath } from "../utils.js";
import { ReplaceByPatternSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function replaceByPattern(args: unknown, allowedDirectories: string[]) {
  const parsed = ReplaceByPatternSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for replace_by_pattern: ${parsed.error}`);
    throw new Error(`Invalid arguments for replace_by_pattern: ${parsed.error}`);
  }
  
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const content = await fs.readFile(validPath, 'utf-8');
  
  const regex = new RegExp(parsed.data.pattern, parsed.data.flags);
  const newContent = content.replace(regex, parsed.data.replacement);
  
  await fs.writeFile(validPath, newContent, 'utf-8');
  
  logger.info(`Successfully replaced content in ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully replaced content in ${parsed.data.path}` }]
  };
}
