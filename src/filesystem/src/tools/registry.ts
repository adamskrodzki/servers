import { ToolDefinition } from "./types.js";
import { readFileToolDefinition } from "./descriptions/read_file.js";
import { readMultipleFilesToolDefinition } from "./descriptions/read_multiple_files.js";
import { writeFileToolDefinition } from "./descriptions/write_file.js";
import { 
  readFile,
  readMultipleFiles,
  writeFile
} from "../operations/index.js";

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  registerHandler(name: string, handler: ToolDefinition["handler"]) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    tool.handler = handler;
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}

export const registry = new ToolRegistry();

// Register all tools
[
  readFileToolDefinition,
  readMultipleFilesToolDefinition,
  writeFileToolDefinition
].forEach(tool => registry.register(tool));

// Register all handlers
const handlers = {
  read_file: readFile,
  read_multiple_files: readMultipleFiles,
  write_file: writeFile
};

Object.entries(handlers).forEach(([name, handler]) => {
  registry.registerHandler(name, handler);
});