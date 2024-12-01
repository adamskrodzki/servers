import { z } from "zod";

export const TextRangeSchema = z.object({
  beforeText: z.string().describe("Text that appears before the target range"),
  afterText: z.string().describe("Text that appears after the target range")
});

export const CopyToNewFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to copy"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path where the new file will be created")
});

export const CutToNewFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to move"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path where the new file will be created")
});

export const AppendToFileSchema = z.object({
  sourcePath: z.string().describe("Path to the source file containing text to append"),
  range: TextRangeSchema,
  targetPath: z.string().describe("Path to the file where content will be appended")
});

export const InsertAtPositionSchema = z.object({
  path: z.string().describe("Path to the file where content will be inserted"),
  position: TextRangeSchema,
  content: z.string().describe("Text content to insert")
});

export const DeleteRangeSchema = z.object({
  path: z.string().describe("Path to the file where content will be deleted"),
  range: TextRangeSchema
});

export const ReplaceBlockSchema = z.object({
  path: z.string().describe("Path to the file where content will be replaced"),
  range: TextRangeSchema,
  content: z.string().describe("New text content to replace the matched range")
});

export const ReplaceByPatternSchema = z.object({
  path: z.string().describe("Path to the file where content will be replaced"),
  pattern: z.string().describe("Regular expression pattern to match"),
  flags: z.string().optional().describe("Regular expression flags"),
  replacement: z.string().describe("Replacement text (can include regex capture groups)")
});

export const ReadFileArgsSchema = z.object({
  path: z.string(),
});

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export const WebSearchArgsSchema = z.object({
  query: z.string(),
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

export const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});