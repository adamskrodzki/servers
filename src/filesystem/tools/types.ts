export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // We'll replace this with a more specific type later
  handler?: (args: any, allowedDirectories: string[]) => Promise<any>;
}