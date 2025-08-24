
// Advanced path resolution with minimum 2-level matching
export function resolveSourcePath(filePath: string, sourceFiles: Record<string, string> | undefined): string | null {
  // Get selected src subdirectory from localStorage
  const srcSubdir = typeof window !== 'undefined' ? localStorage.getItem('profiler-src-subdir') : null;
  
  // Try exact path match first
  if (sourceFiles && sourceFiles[filePath]) {
    return sourceFiles[filePath];
  }
  
  if (!sourceFiles) {
    return null;
  }
  
  // Extract path components
  const pathParts = filePath.split('/').filter(part => part.length > 0);
  const filename = pathParts[pathParts.length - 1];
  
  if (!filename) {
    return null;
  }
  
  // Try intelligent path resolution with src subdirectory
  if (srcSubdir) {
    // For the source directory remapping, we need to find files that might be stored
    // under subdirectories. The srcSubdir is a subdirectory within 'src/'
    
    // Algorithm 1: Try different suffix combinations with srcSubdir prefix
    // For example: fl=/home/td/2025/valgrind_test/main.c with srcSubdir=temp
    // Try: temp/home/td/2025/valgrind_test/main.c, temp/td/2025/valgrind_test/main.c, etc.
    for (let i = 0; i < pathParts.length - 1; i++) {
      const suffixParts = pathParts.slice(i);
      if (suffixParts.length >= 2) { // Minimum 2-level matching
        const candidatePath = `${srcSubdir}/${suffixParts.join('/')}`;
        if (sourceFiles[candidatePath]) {
          return sourceFiles[candidatePath];
        }
      }
    }
    
    // Algorithm 2: Check if file exists directly in srcSubdir
    const directPath = `${srcSubdir}/${filename}`;
    if (sourceFiles[directPath]) {
      return sourceFiles[directPath];
    }
    
    // Algorithm 3: Try with src prefix (since we store files with src/ prefix too)
    for (let i = 0; i < pathParts.length - 1; i++) {
      const suffixParts = pathParts.slice(i);
      if (suffixParts.length >= 2) {
        const candidatePath = `src/${srcSubdir}/${suffixParts.join('/')}`;
        if (sourceFiles[candidatePath]) {
          return sourceFiles[candidatePath];
        }
      }
    }
  }
  
  // Try to match with any available source file
  if (sourceFiles) {
    for (const [key, content] of Object.entries(sourceFiles)) {
      const keyParts = key.split('/').filter(part => part.length > 0);
      
      // First try exact filename match
      if (keyParts.length > 0 && keyParts[keyParts.length - 1] === filename) {
        return content;
      }
      
      // Then check if the last 2 or more parts match
      if (pathParts.length >= 2) {
        for (let minMatch = 2; minMatch <= Math.min(pathParts.length, keyParts.length); minMatch++) {
          const filePathSuffix = pathParts.slice(-minMatch).join('/');
          const keySuffix = keyParts.slice(-minMatch).join('/');
          
          if (filePathSuffix === keySuffix) {
            return content;
          }
        }
      }
    }
  }
  
  // No fallback on client side
  return null;
}