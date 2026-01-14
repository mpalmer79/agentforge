[code-assistant.md](https://github.com/user-attachments/files/24618562/code-assistant.md)
# Code Assistant Agent

An AI-powered coding assistant that can read files, search code, and explain programming concepts.

## Overview

This example demonstrates:
- File system tools
- Code search and analysis
- Multi-step reasoning
- Context-aware assistance

## Full Code

```typescript
import { Agent, OpenAIProvider, defineTool } from 'agentforge';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================
// Tools
// ============================================

const readFileTool = defineTool({
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: z.object({
    filePath: z.string().describe('Path to the file'),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      return { 
        success: true, 
        content, 
        lines,
        extension: path.extname(filePath),
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Could not read file: ${error.message}` 
      };
    }
  },
});

const listDirectoryTool = defineTool({
  name: 'list_directory',
  description: 'List files and folders in a directory',
  parameters: z.object({
    dirPath: z.string().describe('Path to the directory'),
    recursive: z.boolean().default(false).describe('Include subdirectories'),
  }),
  execute: async ({ dirPath, recursive }) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const files: string[] = [];
      const directories: string[] = [];
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          directories.push(entry.name);
          
          if (recursive) {
            const subEntries = await fs.readdir(fullPath);
            for (const sub of subEntries) {
              files.push(`${entry.name}/${sub}`);
            }
          }
        } else {
          files.push(entry.name);
        }
      }
      
      return { success: true, files, directories };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

const searchCodeTool = defineTool({
  name: 'search_code',
  description: 'Search for a pattern in code files',
  parameters: z.object({
    directory: z.string().describe('Directory to search'),
    pattern: z.string().describe('Search pattern (text or regex)'),
    fileExtensions: z.array(z.string()).default(['.ts', '.js', '.tsx', '.jsx']),
  }),
  execute: async ({ directory, pattern, fileExtensions }) => {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const regex = new RegExp(pattern, 'gi');
    
    async function searchDir(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await searchDir(fullPath);
        } else if (entry.isFile() && fileExtensions.some(ext => entry.name.endsWith(ext))) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              results.push({
                file: fullPath,
                line: index + 1,
                content: line.trim().slice(0, 100),
              });
            }
          });
        }
      }
    }
    
    try {
      await searchDir(directory);
      return { success: true, matches: results.slice(0, 20), total: results.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

const analyzeCodeTool = defineTool({
  name: 'analyze_code',
  description: 'Analyze code structure and provide metrics',
  parameters: z.object({
    filePath: z.string().describe('Path to the file to analyze'),
  }),
  execute: async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Simple analysis
      const imports = lines.filter(l => l.trim().startsWith('import ')).length;
      const exports = lines.filter(l => l.includes('export ')).length;
      const functions = (content.match(/function\s+\w+|const\s+\w+\s*=\s*(\([^)]*\)|async\s*\([^)]*\))\s*=>/g) || []).length;
      const classes = (content.match(/class\s+\w+/g) || []).length;
      const comments = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('/*')).length;
      
      return {
        success: true,
        metrics: {
          totalLines: lines.length,
          imports,
          exports,
          functions,
          classes,
          comments,
          codeLines: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

// ============================================
// Agent
// ============================================

const agent = new Agent({
  provider: new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4-turbo',
  }),
  tools: [readFileTool, listDirectoryTool, searchCodeTool, analyzeCodeTool],
  systemPrompt: `You are an expert code assistant. You help developers by:
- Reading and explaining code files
- Searching codebases for patterns
- Analyzing code structure
- Suggesting improvements

When examining code:
1. First understand the file structure
2. Read relevant files
3. Provide clear explanations
4. Suggest best practices when appropriate

Always be specific and reference actual code when explaining.`,
});

// ============================================
// Usage
// ============================================

async function assist(question: string) {
  console.log(`Developer: ${question}\n`);
  
  const response = await agent.run(question);
  console.log(`Assistant: ${response.content}\n`);
  
  if (response.toolResults?.length) {
    console.log(`[Examined ${response.toolResults.length} files/directories]\n`);
  }
}

await assist('What files are in the src directory?');
await assist('Show me the main Agent class');
await assist('Find all places where we use middleware');
await assist('Analyze the code quality of src/agent.ts');
```

## Key Patterns

### 1. File System Safety

```typescript
if (entry.name.startsWith('.')) continue;           // Skip hidden
if (entry.name === 'node_modules') continue;        // Skip deps
```

### 2. Bounded Results

```typescript
return { 
  matches: results.slice(0, 20),  // Limit results
  total: results.length           // Show total count
};
```

### 3. Structured Analysis

```typescript
return {
  metrics: {
    totalLines,
    imports,
    exports,
    functions,
    // ...
  },
};
```

## Use Cases

- **Code Review**: "Analyze the error handling in this file"
- **Documentation**: "Explain what this function does"
- **Refactoring**: "Find all usages of this deprecated API"
- **Onboarding**: "Show me the main entry points"

## Try It

```bash
export OPENAI_API_KEY=your-key
npx ts-node examples/code-assistant/index.ts
```
