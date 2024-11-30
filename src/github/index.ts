#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { exec } from "child_process"
import {
  GitHubForkSchema,
  GitHubReferenceSchema,
  GitHubRepositorySchema,
  GitHubIssueSchema,
  GitHubPullRequestSchema,
  GitHubContentSchema,
  GitHubCreateUpdateFileResponseSchema,
  GitHubSearchResponseSchema,
  GitHubTreeSchema,
  GitHubCommitSchema,
  CreateRepositoryOptionsSchema,
  CreateIssueOptionsSchema,
  CreatePullRequestOptionsSchema,
  CreateBranchOptionsSchema,
  type GitHubFork,
  type GitHubReference,
  type GitHubRepository,
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubContent,
  type GitHubCreateUpdateFileResponse,
  type GitHubSearchResponse,
  type GitHubTree,
  type GitHubCommit,
  type FileOperation,
  CreateOrUpdateFileSchema,
  SearchRepositoriesSchema,
  CreateRepositorySchema,
  GetFileContentsSchema,
  PushFilesSchema,
  CreateIssueSchema,
  CreatePullRequestSchema,
  ForkRepositorySchema,
  CreateBranchSchema,
  RunGitCommandSchema
} from './schemas.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const server = new Server({
  name: "github-mcp-server",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {}
  }
});

const GITHUB_PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!GITHUB_PERSONAL_ACCESS_TOKEN) {
  console.error("GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set");
  process.exit(1);
}


async function runGitCommand(
  cwd: string,
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<string> {
  const gitCommand = `git ${command} ${args.join(' ')}`;
  
  return new Promise((resolve, reject) => {
    exec(gitCommand, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // Disable git credential prompts
        ...env
      }
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Git command failed: ${error.message}\
${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}


async function forkRepository(
  owner: string,
  repo: string,
  organization?: string
): Promise<GitHubFork> {
  const url = organization 
    ? `https://api.github.com/repos/${owner}/${repo}/forks?organization=${organization}`
    : `https://api.github.com/repos/${owner}/${repo}/forks`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubForkSchema.parse(await response.json());
}

async function createBranch(
  owner: string,
  repo: string,
  options: z.infer<typeof CreateBranchOptionsSchema>
): Promise<GitHubReference> {
  const fullRef = `refs/heads/${options.ref}`;
  
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ref: fullRef,
        sha: options.sha
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubReferenceSchema.parse(await response.json());
}

async function getDefaultBranchSHA(
  owner: string,
  repo: string
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`,
    {
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server"
      }
    }
  );

  if (!response.ok) {
    const masterResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/master`,
      {
        headers: {
          "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "github-mcp-server"
        }
      }
    );

    if (!masterResponse.ok) {
      throw new Error("Could not find default branch (tried 'main' and 'master')");
    }

    const data = GitHubReferenceSchema.parse(await masterResponse.json());
    return data.object.sha;
  }

  const data = GitHubReferenceSchema.parse(await response.json());
  return data.object.sha;
}

async function getFileContents(
  owner: string,
  repo: string,
  path: string,
  branch?: string
): Promise<GitHubContent> {
  let url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  if (branch) {
    url += `?ref=${branch}`;
  }

  const response = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const data = GitHubContentSchema.parse(await response.json());

  // If it's a file, decode the content
  if (!Array.isArray(data) && data.content) {
    data.content = Buffer.from(data.content, 'base64').toString('utf8');
  }

  return data;
}

async function createIssue(
  owner: string,
  repo: string,
  options: z.infer<typeof CreateIssueOptionsSchema>
): Promise<GitHubIssue> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubIssueSchema.parse(await response.json());
}

async function createPullRequest(
  owner: string,
  repo: string,
  options: z.infer<typeof CreatePullRequestOptionsSchema>
): Promise<GitHubPullRequest> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubPullRequestSchema.parse(await response.json());
}

async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<GitHubCreateUpdateFileResponse> {
  const encodedContent = Buffer.from(content).toString('base64');

  let currentSha = sha;
  if (!currentSha) {
    try {
      const existingFile = await getFileContents(owner, repo, path, branch);
      if (!Array.isArray(existingFile)) {
        currentSha = existingFile.sha;
      }
    } catch (error) {
      console.error('Note: File does not exist in branch, will create new file');
    }
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const body = {
    message,
    content: encodedContent,
    branch,
    ...(currentSha ? { sha: currentSha } : {})
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubCreateUpdateFileResponseSchema.parse(await response.json());
}

async function createTree(
  owner: string,
  repo: string,
  files: FileOperation[],
  baseTree?: string
): Promise<GitHubTree> {
  const tree = files.map(file => ({
    path: file.path,
    mode: '100644' as const,
    type: 'blob' as const,
    content: file.content
  }));

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tree,
        base_tree: baseTree
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubTreeSchema.parse(await response.json());
}

async function createCommit(
  owner: string,
  repo: string,
  message: string,
  tree: string,
  parents: string[]
): Promise<GitHubCommit> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        tree,
        parents
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubCommitSchema.parse(await response.json());
}

async function updateReference(
  owner: string,
  repo: string,
  ref: string,
  sha: string
): Promise<GitHubReference> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/${ref}`,
    {
      method: "PATCH",
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sha,
        force: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubReferenceSchema.parse(await response.json());
}

async function pushFiles(
  owner: string,
  repo: string,
  branch: string,
  files: FileOperation[],
  message: string
): Promise<GitHubReference> {
  const refResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      headers: {
        "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "github-mcp-server"
      }
    }
  );

  if (!refResponse.ok) {
    throw new Error(`GitHub API error: ${refResponse.statusText}`);
  }

  const ref = GitHubReferenceSchema.parse(await refResponse.json());
  const commitSha = ref.object.sha;

  const tree = await createTree(owner, repo, files, commitSha);
  const commit = await createCommit(owner, repo, message, tree.sha, [commitSha]);
  return await updateReference(owner, repo, `heads/${branch}`, commit.sha);
}

async function searchRepositories(
  query: string,
  page: number = 1,
  perPage: number = 30
): Promise<GitHubSearchResponse> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.append("q", query);
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubSearchResponseSchema.parse(await response.json());
}

async function createRepository(
  options: z.infer<typeof CreateRepositoryOptionsSchema>
): Promise<GitHubRepository> {
  const response = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return GitHubRepositorySchema.parse(await response.json());
}

async function cloneRepository(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
  depth?: number
): Promise<GitHubRepository> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "github-mcp-server"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  const repository = GitHubRepositorySchema.parse(await response.json());

  const cloneUrl = repository.clone_url;
  const branchArg = branch ? `--branch ${branch}` : '';
  const depthArg = depth ? `--depth ${depth}` : '';

  const command = `git clone ${cloneUrl} ${branchArg} ${depthArg} ${path}`;

  const { exec } = require('child_process');
  await new Promise((resolve, reject) => {
    exec(command, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error(`Failed to clone repository: ${error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });

  return repository;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_or_update_file",
        description: "Create or update a single file in a GitHub repository",
        inputSchema: zodToJsonSchema(CreateOrUpdateFileSchema)
      },
      {
        name: "run_git_command",
        description: "Run an arbitrary git command in a specified directory",
        inputSchema: zodToJsonSchema(RunGitCommandSchema)
      },
      {
        name: "search_repositories",
        description: "Search for GitHub repositories",
        inputSchema: zodToJsonSchema(SearchRepositoriesSchema)
      },
      {
        name: "create_repository",
        description: "Create a new GitHub repository in your account",
        inputSchema: zodToJsonSchema(CreateRepositorySchema)
      },
      {
        name: "get_file_contents",
        description: "Get the contents of a file or directory from a GitHub repository",
        inputSchema: zodToJsonSchema(GetFileContentsSchema)
      },
      {
        name: "push_files",
        description: "Push multiple files to a GitHub repository in a single commit",
        inputSchema: zodToJsonSchema(PushFilesSchema)
      },
      {
        name: "create_issue",
        description: "Create a new issue in a GitHub repository",
        inputSchema: zodToJsonSchema(CreateIssueSchema)
      },
      {
        name: "create_pull_request",
        description: "Create a new pull request in a GitHub repository",
        inputSchema: zodToJsonSchema(CreatePullRequestSchema)
      },
      {
        name: "fork_repository",
        description: "Fork a GitHub repository to your account or specified organization",
        inputSchema: zodToJsonSchema(ForkRepositorySchema)
      },
      {
        name: "create_branch",
        description: "Create a new branch in a GitHub repository",
        inputSchema: zodToJsonSchema(CreateBranchSchema)
      },
      {
        name: "clone_repository",
        description: "Clone a GitHub repository to a specified path",
        inputSchema: zodToJsonSchema(z.object({
          owner: z.string().describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          path: z.string().describe("Path where to clone the repository"),
          branch: z.string().optional().describe("Branch to clone (default to the repository's default branch)"),
          depth: z.number().optional().describe("Depth of the clone (for shallow clones)")
        }))
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "run_git_command": {
        const args = RunGitCommandSchema.parse(request.params.arguments);
        const result = await runGitCommand(args.cwd, args.command, args.args, args.env);
        return { toolResult: { output: result } };
      }

      case "fork_repository": {
        const args = ForkRepositorySchema.parse(request.params.arguments);
        const fork = await forkRepository(args.owner, args.repo, args.organization);
        return { toolResult: fork };
      }

      case "create_branch": {
        const args = CreateBranchSchema.parse(request.params.arguments);
        let sha: string;
        if (args.from_branch) {
          const response = await fetch(
            `https://api.github.com/repos/${args.owner}/${args.repo}/git/refs/heads/${args.from_branch}`,
            {
              headers: {
                "Authorization": `token ${GITHUB_PERSONAL_ACCESS_TOKEN}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "github-mcp-server"
              }
            }
          );

          if (!response.ok) {
            throw new Error(`Source branch '${args.from_branch}' not found`);
          }

          const data = GitHubReferenceSchema.parse(await response.json());
          sha = data.object.sha;
        } else {
          sha = await getDefaultBranchSHA(args.owner, args.repo);
        }

        const branch = await createBranch(args.owner, args.repo, {
          ref: args.branch,
          sha
        });

        return { toolResult: branch };
      }

      case "search_repositories": {
        const args = SearchRepositoriesSchema.parse(request.params.arguments);
        const results = await searchRepositories(args.query, args.page, args.perPage);
        return { toolResult: results };
      }

      case "create_repository": {
        const args = CreateRepositorySchema.parse(request.params.arguments);
        const repository = await createRepository(args);
        return { toolResult: repository };
      }

      case "get_file_contents": {
        const args = GetFileContentsSchema.parse(request.params.arguments);
        const contents = await getFileContents(args.owner, args.repo, args.path, args.branch);
        return { toolResult: contents };
      }

      case "create_or_update_file": {
        const args = CreateOrUpdateFileSchema.parse(request.params.arguments);
        const result = await createOrUpdateFile(
          args.owner,
          args.repo,
          args.path,
          args.content,
          args.message,
          args.branch,
          args.sha
        );
        return { toolResult: result };
      }

      

      case "push_files": {
        const args = PushFilesSchema.parse(request.params.arguments);
        const result = await pushFiles(
          args.owner,
          args.repo,
          args.branch,
          args.files,
          args.message
        );
        return { toolResult: result };
      }

      case "create_issue": {
        const args = CreateIssueSchema.parse(request.params.arguments);
        const { owner, repo, ...options } = args;
        const issue = await createIssue(owner, repo, options);
        return { toolResult: issue };
      }

      case "create_pull_request": {
        const args = CreatePullRequestSchema.parse(request.params.arguments);
        const { owner, repo, ...options } = args;
        const pullRequest = await createPullRequest(owner, repo, options);
        return { toolResult: pullRequest };
      }

      case "clone_repository": {
        const args = z.object({
          owner: z.string(),
          repo: z.string(),
          path: z.string(),
          branch: z.string().optional(),
          depth: z.number().optional()
        }).parse(request.params.arguments);
        const repository = await cloneRepository(args.owner, args.repo, args.path, args.branch, args.depth);
        return { toolResult: repository };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
