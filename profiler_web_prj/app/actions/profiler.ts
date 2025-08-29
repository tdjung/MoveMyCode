'use server';

import { CachegrindParser } from '@/lib/cachegrind-parser';
import { CachegrindData } from '@/types/profiler';
import { readSourceFile, listSourceFiles } from './source-files';
import fs from 'fs/promises';
import path from 'path';

export async function parseCachegrindFile(formData: FormData): Promise<{
  success: boolean;
  data?: CachegrindData;
  error?: string;
  filename?: string;
}> {
  try {
    const file = formData.get('file') as File;
    
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      return { success: false, error: 'File size exceeds 100MB limit' };
    }

    const content = await file.text();
    
    // Read source files from src directory (including subdirectories)
    const sourceFiles: Record<string, string> = {};
    const srcFileList = await listSourceFiles();
    
    for (const srcFile of srcFileList) {
      const fileContent = await readSourceFile(srcFile);
      if (fileContent) {
        // Store with full relative path (e.g., "subdir/file.c" or just "file.c")
        sourceFiles[srcFile] = fileContent;
        
        // Also store with "src/" prefix for path resolution
        sourceFiles[`src/${srcFile}`] = fileContent;
      }
    }
    
    const parser = new CachegrindParser(content, sourceFiles);
    const data = parser.parse();
    
    // Update the project name to include the actual filename
    data.projectName = `Analysis - ${file.name}`;

    return { success: true, data, filename: file.name };
  } catch (error) {
    console.error('Error parsing cachegrind file:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to parse cachegrind file' 
    };
  }
}

export async function listServerFiles(directory: string = 'output'): Promise<{
  success: boolean;
  files?: {
    name: string;
    size: number;
    isDirectory: boolean;
    modifiedTime: Date;
  }[];
  error?: string;
  currentPath?: string;
}> {
  try {
    // Use absolute path from project root
    const projectRoot = process.cwd();
    const outputRoot = path.join(projectRoot, 'output');
    const fullPath = path.join(projectRoot, directory);
    
    // Security check - ensure we're not going outside project directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedOutput = path.resolve(outputRoot);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return { success: false, error: 'Access denied: Path is outside project directory' };
    }
    
    // Additional check - ensure we're not going above output directory
    if (!resolvedPath.startsWith(resolvedOutput)) {
      return { success: false, error: 'Access denied: Path is outside output directory' };
    }
    
    // Check if directory exists
    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return { success: false, error: 'Path is not a directory' };
      }
    } catch {
      // If directory doesn't exist, create it
      await fs.mkdir(resolvedPath, { recursive: true });
    }
    
    // Read directory contents
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullEntryPath = path.join(resolvedPath, entry.name);
        const stats = await fs.stat(fullEntryPath);
        
        return {
          name: entry.name,
          size: stats.size,
          isDirectory: entry.isDirectory(),
          modifiedTime: stats.mtime
        };
      })
    );
    
    // Sort directories first, then files
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    return { 
      success: true, 
      files, 
      currentPath: path.relative(projectRoot, resolvedPath)
    };
  } catch (error) {
    console.error('Error listing server files:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to list server files' 
    };
  }
}

export async function readServerFile(filePath: string): Promise<{
  success: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const projectRoot = process.cwd();
    const outputRoot = path.join(projectRoot, 'output');
    const fullPath = path.join(projectRoot, filePath);
    
    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedRoot = path.resolve(projectRoot);
    const resolvedOutput = path.resolve(outputRoot);
    
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return { success: false, error: 'Access denied: Path is outside project directory' };
    }
    
    // Additional check - ensure we're not going above output directory
    if (!resolvedPath.startsWith(resolvedOutput)) {
      return { success: false, error: 'Access denied: Path is outside output directory' };
    }
    
    // Check if file exists
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return { success: false, error: 'Path is not a file' };
    }
    
    // Check file size limit
    if (stats.size > 100 * 1024 * 1024) { // 100MB limit
      return { success: false, error: 'File size exceeds 100MB limit' };
    }
    
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading server file:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to read server file' 
    };
  }
}