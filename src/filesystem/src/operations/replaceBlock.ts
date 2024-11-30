import fs from "fs/promises";
import { validatePath, findRange } from "../utils.js";
import { ReplaceBlockSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function replaceBlock(args: unknown, allowedDirectories: string[]) {
  const parsed = ReplaceBlockSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for replace_block: ${parsed.error}`);
    throw new Error(`Invalid arguments for replace_block: ${parsed.error}`);
  }
  
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const content = await fs.readFile(validPath, 'utf-8');
  const range = await findRange(content, parsed.data.range);
  if (!range) {
    logger.error('Range not found');
    throw new Error('Range not found');
  }
  
  const newContent = content.substring(0, range[0]) + 
                    parsed.data.content + 
                    content.substring(range[1]);
  
  await fs.writeFile(validPath, newContent, 'utf-8');
  
  logger.info(`Successfully replaced content in ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully replaced content in ${parsed.data.path}` }]
  };
}
