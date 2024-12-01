import path from "path";
import os from 'os';
import fs from "fs/promises";
import { logger } from './logger.js';
import { z } from "zod";
import { TextRangeSchema } from "./schemas.js";

export interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Normalize all paths consistently
export function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase();
}

export function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export async function validatePath(requestedPath: string, allowedDirectories: string[]): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
    
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    logger.error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      logger.error("Access denied - symlink target outside allowed directories");
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    logger.info(`Validated path: ${realPath}`);
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        logger.error("Access denied - parent directory outside allowed directories");
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      logger.info(`Validated parent directory: ${realParentPath}`);
      return absolute;
    } catch {
      logger.error(`Parent directory does not exist: ${parentDir}`);
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

export async function getFileStats(filePath: string): Promise<FileInfo> {
  logger.info(`Getting file stats for: ${filePath}`);
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

export async function findRange(content: string, range: z.infer<typeof TextRangeSchema>): Promise<[number, number] | null> {
  const fullPattern = escapeRegExp(range.beforeText) + '(.*?)' + escapeRegExp(range.afterText);
  const regex = new RegExp(fullPattern, 's');
  const match = content.match(regex);
  if (!match) return null;
  return [
    match.index! + range.beforeText.length,
    match.index! + match[0].length - range.afterText.length
  ];
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchFiles(
  rootPath: string,
  pattern: string,
  allowedDirectories: string[],
): Promise<string[]> {
  logger.info(`Searching files in ${rootPath} with pattern: ${pattern}`);
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      try {
        // Validate each path before processing
        await validatePath(fullPath, allowedDirectories);

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        logger.error(`Error during search: ${error}`);
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}
