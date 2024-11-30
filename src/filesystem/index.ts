#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

async function findRange(content: string, range: z.infer<typeof TextRangeSchema>): Promise<[number, number] | null> {
  const fullPattern = escapeRegExp(range.beforeText) + '(.*?)' + escapeRegExp(range.afterText);
  const regex = new RegExp(fullPattern, 's');
  const match = content.match(regex);
  if (!match) return null;
  return [
    match.index! + range.beforeText.length,
    match.index! + match[0].length - range.afterText.length
  ];
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase();
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
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

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
    
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    logger.error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`); // Use logger
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      logger.error("Access denied - symlink target outside allowed directories"); // Use logger
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    logger.info(`Validated path: ${realPath}`); // Use logger
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        logger.error("Access denied - parent directory outside allowed directories"); // Use logger
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      logger.info(`Validated parent directory: ${realParentPath}`); // Use logger
      return absolute;
    } catch {
      logger.error(`Parent directory does not exist: ${parentDir}`); // Use logger
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions

const TextRangeSchema = z.object({
  beforeText: z.string().describe("Text that appears before the target range"),
  afterText: z.string().describe("Text that appears after the target range")
});

const CopyToNewFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to copy"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path where the new file will be created")
});

const CutToNewFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to move"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path where the new file will be created")
});

const AppendToFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to append"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path to the file where content will be appended")
});

const InsertAtPositionSchema = z.object({
  path: z.string().describe("Path to the file where content will be inserted"),
  position: TextRangeSchema,
  content: z.string().describe("Text content to insert")
});

const DeleteRangeSchema = z.object({
  path: z.string().describe("Path to the file where content will be deleted"),
  range: TextRangeSchema
});

const ReplaceBlockSchema = z.object({
  path: z.string().describe("Path to the file where content will be replaced"),
  range: TextRangeSchema,
  content: z.string().describe("New text content to replace the matched range")
});

const ReplaceByPatternSchema = z.object({
  path: z.string().describe("Path to the file where content will be replaced"),
  pattern: z.string().describe("Regular expression pattern to match"),
  flags: z.string().optional().describe("Regular expression flags"),
  replacement: z.string().describe("Replacement text (can include regex capture groups)")
});


const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

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

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  logger.info(`Getting file stats for: ${filePath}`); // Use logger
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

async function searchFiles(
  rootPath: string,
  pattern: string,
): Promise<string[]> {
  logger.info(`Searching files in ${rootPath} with pattern: ${pattern}`); // Use logger
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      try {
        // Validate each path before processing
        await validatePath(fullPath);

        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }

        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        logger.error(`Error during search: ${error}`); // Use logger
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info("Listing available tools"); // Use logger
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
    ],
  };
});


server.setRequestHandler(CallToolRequestSchema, async (request) => {
  logger.info(`Received tool call: ${JSON.stringify(request.params)}`); // Use logger
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for read_file: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, "utf-8");
        logger.info(`Successfully read file: ${validPath}`); // Use logger
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for read_multiple_files: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              logger.info(`Successfully read file: ${validPath}`); // Use logger
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              logger.error(`Error reading file ${filePath}: ${error}`); // Use logger
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for write_file: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        logger.info(`Successfully wrote to file: ${validPath}`); // Use logger
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for create_directory: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for list_directory: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for move_file: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for search_files: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.error(`Invalid arguments for get_file_info: ${parsed.error}`); // Use logger
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }

      case "list_allowed_directories": {
        return {
          content: [{ 
            type: "text", 
            text: `Allowed directories:\n${allowedDirectories.join('\n')}` 
          }],
        };
      }

      case "copy_to_new_file": {
        const parsed = CopyToNewFileSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validSourcePath = await validatePath(parsed.data.sourcePath);
        const validTargetPath = await validatePath(parsed.data.targetPath);
        
        const content = await fs.readFile(validSourcePath, 'utf-8');
        const range = await findRange(content, parsed.data.range);
        if (!range) throw new Error('Range not found in source file');
        
        const extractedContent = content.substring(range[0], range[1]);
        await fs.writeFile(validTargetPath, extractedContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully copied content to ${parsed.data.targetPath}` }]
        };
      }
      
      case "cut_to_new_file": {
        const parsed = CutToNewFileSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validSourcePath = await validatePath(parsed.data.sourcePath);
        const validTargetPath = await validatePath(parsed.data.targetPath);
        
        const content = await fs.readFile(validSourcePath, 'utf-8');
        const range = await findRange(content, parsed.data.range);
        if (!range) throw new Error('Range not found in source file');
        
        const extractedContent = content.substring(range[0], range[1]);
        const newContent = content.substring(0, range[0]) + content.substring(range[1]);
        
        await fs.writeFile(validTargetPath, extractedContent, 'utf-8');
        await fs.writeFile(validSourcePath, newContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully moved content to ${parsed.data.targetPath}` }]
        };
      }
      
      case "append_to_file": {
        const parsed = AppendToFileSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validSourcePath = await validatePath(parsed.data.sourcePath);
        const validTargetPath = await validatePath(parsed.data.targetPath);
        
        const content = await fs.readFile(validSourcePath, 'utf-8');
        const range = await findRange(content, parsed.data.range);
        if (!range) throw new Error('Range not found in source file');
        
        const extractedContent = content.substring(range[0], range[1]);
        await fs.appendFile(validTargetPath, extractedContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully appended content to ${parsed.data.targetPath}` }]
        };
      }
      
      case "insert_at_position": {
        const parsed = InsertAtPositionSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, 'utf-8');
        const position = await findRange(content, parsed.data.position);
        if (!position) throw new Error('Insert position not found');
        
        const newContent = content.substring(0, position[0]) + 
                          parsed.data.content + 
                          content.substring(position[0]);
        
        await fs.writeFile(validPath, newContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully inserted content in ${parsed.data.path}` }]
        };
      }
      
      case "delete_range": {
        const parsed = DeleteRangeSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, 'utf-8');
        const range = await findRange(content, parsed.data.range);
        if (!range) throw new Error('Range not found');
        
        const newContent = content.substring(0, range[0]) + content.substring(range[1]);
        await fs.writeFile(validPath, newContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully deleted content from ${parsed.data.path}` }]
        };
      }
      
      case "replace_block": {
        const parsed = ReplaceBlockSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, 'utf-8');
        const range = await findRange(content, parsed.data.range);
        if (!range) throw new Error('Range not found');
        
        const newContent = content.substring(0, range[0]) + 
                          parsed.data.content + 
                          content.substring(range[1]);
        
        await fs.writeFile(validPath, newContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully replaced content in ${parsed.data.path}` }]
        };
      }
      
      case "replace_by_pattern": {
        const parsed = ReplaceByPatternSchema.safeParse(args);
        if (!parsed.success) throw new Error(`Invalid arguments: ${parsed.error}`);
        
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, 'utf-8');
        
        const regex = new RegExp(parsed.data.pattern, parsed.data.flags);
        const newContent = content.replace(regex, parsed.data.replacement);
        
        await fs.writeFile(validPath, newContent, 'utf-8');
        
        return {
          content: [{ type: "text", text: `Successfully replaced content in ${parsed.data.path}` }]
        };
      }

      default:
        logger.error(`Unknown tool: ${name}`); // Use logger
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

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Secure MCP Filesystem Server running on stdio");
  logger.info("Allowed directories:"+ JSON.stringify(allowedDirectories));
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  logger.error("Fatal error running server:"+ error.message);
  console.error("Fatal error running server:", error);
  process.exit(1);
});

