import fs from "fs/promises";
import { validatePath, findRange } from "../utils.js";
import { DeleteRangeSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function deleteRange(args: unknown, allowedDirectories: string[]) {
  const parsed = DeleteRangeSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for delete_range: ${parsed.error}`);
    throw new Error(`Invalid arguments for delete_range: ${parsed.error}`);
  }
  
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const content = await fs.readFile(validPath, 'utf-8');
  const range = await findRange(content, parsed.data.range);
  if (!range) {
    logger.error('Range not found');
    throw new Error('Range not found');
  }
  
  const newContent = content.substring(0, range[0]) + content.substring(range[1]);
  await fs.writeFile(validPath, newContent, 'utf-8');
  
  logger.info(`Successfully deleted content from ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully deleted content from ${parsed.data.path}` }]
  };
}
