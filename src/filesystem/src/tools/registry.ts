import { ToolDefinition } from "./types.js";
import { readFileToolDefinition } from "./descriptions/read_file.js";
import { readFile } from "../operations/index.js";

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

// Register tools
registry.register(readFileToolDefinition);

// Register handlers
registry.registerHandler("read_file", readFile);