export { toolDescriptions } from './descriptions.js';

export type ToolHandlerContext = {
  allowedDirectories: string[];
};

export type ToolHandlerResult = {
  content: Array<{ type: string; text: string; }>;
  isError?: boolean;
};

export type ToolHandler = (args: unknown, allowedDirectories: string[]) => Promise<ToolHandlerResult>;