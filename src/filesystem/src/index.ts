#!/usr/bin/env node

import {
  readFile,
  readMultipleFiles,
  writeFile,
  createDirectory,
  listDirectory,
  moveFile,
  searchFiles,
  getFileInfo,
  copyToNewFile,
  cutToNewFile,
  appendToFile,
  insertAtPosition,
  deleteRange,
  replaceBlock,
  replaceByPattern
} from './operations/index.js';
import { toolDescriptions } from './tools/descriptions.js';
import { normalizePath, expandHome } from "./utils.js";
import { logger } from './logger.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from 'http';
import path from 'path';
import fs from "fs/promises";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  logger.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir => 
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(args.map(async (dir) => {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      logger.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
    logger.info(`Directory ${dir} is accessible.`);
  } catch (error) {
    logger.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDescriptions,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  logger.info(`Received tool call: ${JSON.stringify(request.params)}`);
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file":
        return await readFile(args, allowedDirectories);

      case "read_multiple_files":
        return await readMultipleFiles(args, allowedDirectories);

      case "write_file":
        return await writeFile(args, allowedDirectories);

      case "create_directory":
        return await createDirectory(args, allowedDirectories);

      case "list_directory":
        return await listDirectory(args, allowedDirectories);

      case "move_file":
        return await moveFile(args, allowedDirectories);

      case "search_files":
        return await searchFiles(args, allowedDirectories);

      case "get_file_info":
        return await getFileInfo(args, allowedDirectories);

      case "list_allowed_directories":
        return {
          content: [{ 
            type: "text", 
            text: `Allowed directories:\n${allowedDirectories.join('\n')}` 
          }],
        };

      case "copy_to_new_file":
        return await copyToNewFile(args, allowedDirectories);
      
      case "cut_to_new_file":
        return await cutToNewFile(args, allowedDirectories);
      
      case "append_to_file":
        return await appendToFile(args, allowedDirectories);
      
      case "insert_at_position":
        return await insertAtPosition(args, allowedDirectories);
      
      case "delete_range":
        return await deleteRange(args, allowedDirectories);
      
      case "replace_block":
        return await replaceBlock(args, allowedDirectories);
      
      case "replace_by_pattern":
        return await replaceByPattern(args, allowedDirectories);

      default:
        logger.error(`Unknown tool: ${name}`);
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

