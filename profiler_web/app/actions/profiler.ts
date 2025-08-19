'use server';

import { CachegrindParser } from '@/lib/cachegrind-parser';
import { CachegrindData } from '@/types/profiler';
import { readSourceFile, listSourceFiles } from './source-files';

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
    
    // Read source files from src directory
    const sourceFiles: Record<string, string> = {};
    const srcFileList = await listSourceFiles();
    
    for (const srcFile of srcFileList) {
      const fileContent = await readSourceFile(srcFile);
      if (fileContent) {
        sourceFiles[srcFile] = fileContent;
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