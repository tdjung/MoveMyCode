'use server';

import { promises as fs } from 'fs';
import path from 'path';

export async function readSourceFile(filename: string): Promise<string | null> {
  try {
    // Security: Only allow reading from src directory
    const safePath = path.basename(filename);
    const srcPath = path.join(process.cwd(), 'src', safePath);
    
    // Check if file exists in src directory
    await fs.access(srcPath);
    
    const content = await fs.readFile(srcPath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Failed to read source file ${filename}:`, error);
    return null;
  }
}

export async function listSourceFiles(): Promise<string[]> {
  try {
    const srcPath = path.join(process.cwd(), 'src');
    const files = await fs.readdir(srcPath);
    
    // Filter for source files (C, C++, etc.)
    const sourceFiles = files.filter(file => 
      /\.(c|cpp|cc|cxx|h|hpp|hxx)$/i.test(file)
    );
    
    return sourceFiles;
  } catch (error) {
    console.error('Failed to list source files:', error);
    return [];
  }
}