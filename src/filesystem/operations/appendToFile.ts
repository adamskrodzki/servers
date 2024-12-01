import fs from "fs/promises";
import { validatePath, findRange } from "../utils.js";
import { AppendToFileSchema } from "../schemas.js";
import { logger } from "../logger.js";

export async function appendToFile(args: unknown, allowedDirectories: string[]) {
  const parsed = AppendToFileSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for append_to_file: ${parsed.error}`);
    throw new Error(`Invalid arguments for append_to_file: ${parsed.error}`);
  }
  
  const validSourcePath = await validatePath(parsed.data.sourcePath, allowedDirectories);
  const validTargetPath = await validatePath(parsed.data.targetPath, allowedDirectories);
  
  const content = await fs.readFile(validSourcePath, 'utf-8');
  const range = await findRange(content, parsed.data.range);
  if (!range) {
    logger.error('Range not found in source file');
    throw new Error('Range not found in source file');
  }
  
  const extractedContent = content.substring(range[0], range[1]);
  await fs.appendFile(validTargetPath, extractedContent, 'utf-8');
  
  logger.info(`Successfully appended content from ${validSourcePath} to ${validTargetPath}`);
  return {
    content: [{ type: "text", text: `Successfully appended content to ${parsed.data.targetPath}` }]
  };
}
