import fs from "fs/promises";
import { validatePath, findRange } from "../utils.js";
import { InsertAtPositionSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function insertAtPosition(args: unknown, allowedDirectories: string[]) {
  const parsed = InsertAtPositionSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for insert_at_position: ${parsed.error}`);
    throw new Error(`Invalid arguments for insert_at_position: ${parsed.error}`);
  }
  
  const validPath = await validatePath(parsed.data.path, allowedDirectories);
  const content = await fs.readFile(validPath, 'utf-8');
  const position = await findRange(content, parsed.data.position);
  if (!position) {
    logger.error('Insert position not found');
    throw new Error('Insert position not found');
  }
  
  const newContent = content.substring(0, position[0]) + 
                    parsed.data.content + 
                    content.substring(position[0]);
  
  await fs.writeFile(validPath, newContent, 'utf-8');
  
  logger.info(`Successfully inserted content in ${validPath}`);
  return {
    content: [{ type: "text", text: `Successfully inserted content in ${parsed.data.path}` }]
  };
}
