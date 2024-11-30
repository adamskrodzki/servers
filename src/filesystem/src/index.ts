#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import winston from 'winston';
import {
  readFile,
  readMultipleFiles,
  writeFile,
  createDirectory,
  listDirectory,
  moveFile,
  getFileInfo,
  copyToNewFile,
  cutToNewFile,
  appendToFile,
  insertAtPosition,
  deleteRange,
  replaceBlock,
  replaceByPattern,
  searchFiles
} from './operations/index.js';
import { AppendToFileSchema, CopyToNewFileSchema, CreateDirectoryArgsSchema, CutToNewFileSchema, DeleteRangeSchema, GetFileInfoArgsSchema, InsertAtPositionSchema, ListDirectoryArgsSchema, MoveFileArgsSchema, ReadFileArgsSchema, ReadMultipleFilesArgsSchema, ReplaceBlockSchema, ReplaceByPatternSchema, SearchFilesArgsSchema, TextRangeSchema, WriteFileArgsSchema } from "./schemas.js";
import { normalizePath, expandHome } from "./utils.js";

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [
    new winston.transports.File({ dirname:'logs',  filename: 'filesystem.log' })
  ]
});


// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  logger.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]"); // Use logger
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
      logger.error(`Error: ${dir} is not a directory`); // Use logger
      process.exit(1);
    }
    logger.info(`Directory ${dir} is accessible.`); // Use logger
  } catch (error) {
    logger.error(`Error accessing directory ${dir}:`, error); // Use logger
    process.exit(1);
  }
}));

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

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
    tools: [
      {
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description: 
          "Returns the list of directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "copy_to_new_file",
        description:
          "Copy a section of text from a source file to a new file. The section is identified " +
          "by surrounding text markers (beforeText and afterText). The operation preserves the " +
          "extracted content exactly as it appears in the source, including whitespace and line endings. " +
          "Creates the target file if it doesn't exist, fails if target exists. Particularly useful " +
          "for extracting specific sections like function definitions, configuration blocks, or " +
          "documentation segments. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CopyToNewFileSchema) as ToolInput,
      },
      {
        name: "cut_to_new_file",
        description:
          "Move a section of text from source file to a new file, removing it from the source. " +
          "The section is identified using surrounding text markers. This operation maintains " +
          "atomicity - either both the extraction and removal succeed, or neither does. Useful for " +
          "refactoring code, splitting files, or moving content between files while preserving the " +
          "exact formatting. Creates target file if needed, fails if target exists. Both files must " +
          "be within allowed directories.",
        inputSchema: zodToJsonSchema(CutToNewFileSchema) as ToolInput,
      },
      {
        name: "append_to_file",
        description:
          "Extract text from source file using markers and append it to an existing target file. " +
          "The operation preserves all formatting and adds the content at the end of the target file " +
          "without modification. Source content remains unchanged. Particularly useful for collecting " +
          "related content from multiple files, building logs, or concatenating file segments. Both " +
          "files must be within allowed directories. Creates target if it doesn't exist.",
        inputSchema: zodToJsonSchema(AppendToFileSchema) as ToolInput,
      },
      {
        name: "insert_at_position",
        description:
          "Insert new content at a specific position in a file, identified by surrounding text markers. " +
          "The position is determined by text that comes before and after the desired insertion point. " +
          "Maintains file integrity by ensuring precise positioning. Useful for adding new entries to " +
          "lists, injecting code snippets, or updating configuration files. Fails if position markers " +
          "aren't found or are ambiguous. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(InsertAtPositionSchema) as ToolInput,
      },
      {
        name: "delete_range",
        description:
          "Remove a section of text from a file, identified by surrounding text markers. The operation " +
          "preserves file integrity and handles whitespace carefully to prevent unintended formatting " +
          "issues. Perfect for cleaning up files, removing deprecated code, or editing configuration. " +
          "The beforeText and afterText markers must uniquely identify the range to be deleted. Only " +
          "works within allowed directories. Operation is atomic - either succeeds completely or fails.",
        inputSchema: zodToJsonSchema(DeleteRangeSchema) as ToolInput,
      },
      {
        name: "replace_block",
        description:
          "Replace a block of text identified by surrounding markers with new content. Maintains file " +
          "formatting and structure while performing the replacement. Ideal for updating version numbers, " +
          "changing configuration values, or modifying code blocks. The operation is atomic and validates " +
          "the uniqueness of markers before making changes. Ensures file integrity throughout the " +
          "operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReplaceBlockSchema) as ToolInput,
      },
      {
        name: "replace_by_pattern",
        description:
          "Replace text matching a regular expression pattern with new content. Supports regex flags " +
          "for case sensitivity, multiline matching, etc. The replacement text can include captured " +
          "groups using standard regex replacement syntax ($1, $2, etc.). Powerful for batch updates, " +
          "format standardization, or complex text transformations. Exercise caution with global flags " +
          "as they affect all matches. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReplaceByPatternSchema) as ToolInput,
      },
    ],
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

