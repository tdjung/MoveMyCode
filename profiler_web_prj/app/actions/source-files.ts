'use server';

import { promises as fs } from 'fs';
import path from 'path';

export async function readSourceFile(filename: string): Promise<string | null> {
  try {
    // Security: Ensure the path stays within src directory
    const normalizedPath = path.normalize(filename);
    if (normalizedPath.includes('..')) {
      console.error(`Invalid path traversal attempt: ${filename}`);
      return null;
    }
    
    // Support both direct filenames and subdirectory paths
    const srcPath = path.join(process.cwd(), 'src', normalizedPath);
    
    // Check if file exists
    await fs.access(srcPath);
    
    const content = await fs.readFile(srcPath, 'utf-8');
    return content;
  } catch (error) {
    // Silently fail for non-existent files (expected behavior)
    return null;
  }
}

async function* walkDirectory(dir: string): AsyncGenerator<string> {
  const files = await fs.readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // Recursively walk subdirectories
      yield* walkDirectory(filePath);
    } else if (file.isFile() && /\.(c|cpp|cc|cxx|h|hpp|hxx|s|S|asm)$/i.test(file.name)) {
      yield filePath;
    }
  }
}

export async function listSourceFiles(): Promise<string[]> {
  try {
    const srcPath = path.join(process.cwd(), 'src');
    const sourceFiles: string[] = [];
    
    // Check if src directory exists
    try {
      await fs.access(srcPath);
    } catch {
      return [];
    }
    
    // Recursively walk the src directory
    for await (const filePath of walkDirectory(srcPath)) {
      // Store relative path from src directory
      const relativePath = path.relative(srcPath, filePath);
      sourceFiles.push(relativePath);
    }
    
    return sourceFiles;
  } catch (error) {
    console.error('Failed to list source files:', error);
    return [];
  }
}