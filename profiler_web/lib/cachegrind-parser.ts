import { CachegrindData, FileCoverage, FunctionData, LineData } from '@/types/profiler';

export class CachegrindParser {
  private events: string[] = [];
  private cmd: string = '';
  private pid: string = '';
  private filesData: Record<string, {
    functions: Record<string, FunctionData>;
    sourceCode: string;
    totalLines: number;
    coveredLines: number;
    coveragePercentage: number;
  }> = {};
  private summary: Record<string, number> = {};
  private sourceFiles: Record<string, string> = {};

  constructor(
    private content: string,
    sourceFiles?: Record<string, string>
  ) {
    if (sourceFiles) {
      this.sourceFiles = sourceFiles;
    }
  }

  private getSourceCode(filePath: string): string | null {
    // Try to find source file in sourceFiles map
    if (this.sourceFiles) {
      // Try exact path match first
      if (this.sourceFiles[filePath]) {
        return this.sourceFiles[filePath];
      }
      
      // Try filename only match
      const filename = filePath.split('/').pop() || filePath;
      if (this.sourceFiles[filename]) {
        return this.sourceFiles[filename];
      }
      
      // Try to match by basename without path
      for (const [key, content] of Object.entries(this.sourceFiles)) {
        const keyBasename = key.split('/').pop() || key;
        if (keyBasename === filename) {
          return content;
        }
      }
    }
    
    return null;
  }

  parse(): CachegrindData {
    const lines = this.content.split('\n');
    let currentFile: string | null = null;
    let currentFunction: string | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Parse header information
      if (trimmedLine.startsWith('events:')) {
        this.events = trimmedLine.split(':')[1].trim().split(/\s+/);
        continue;
      }

      if (trimmedLine.startsWith('cmd:')) {
        this.cmd = trimmedLine.split(':', 2)[1].trim();
        continue;
      }

      if (trimmedLine.startsWith('pid:')) {
        this.pid = trimmedLine.split(':')[1].trim();
        continue;
      }

      if (trimmedLine.startsWith('part:')) {
        continue;
      }

      // Parse file information
      if (trimmedLine.startsWith('fl=')) {
        currentFile = trimmedLine.substring(3);
        if (!this.filesData[currentFile]) {
          this.filesData[currentFile] = {
            functions: {},
            sourceCode: '',
            totalLines: 0,
            coveredLines: 0,
            coveragePercentage: 0.0
          };
        }
        continue;
      }

      // Parse function information
      if (trimmedLine.startsWith('fn=')) {
        currentFunction = trimmedLine.substring(3);
        if (currentFile && currentFunction) {
          this.filesData[currentFile].functions[currentFunction] = {
            lines: {},
            totals: Object.fromEntries(this.events.map(event => [event, 0])),
            coveredLines: [],
            uncoveredLines: [],
            coveragePercentage: 0.0
          };
        }
        continue;
      }

      // Parse summary
      if (trimmedLine.startsWith('summary:')) {
        const summaryValues = trimmedLine.split(':')[1].trim().split(/\s+/);
        this.summary = Object.fromEntries(
          this.events.map((event, idx) => [event, parseInt(summaryValues[idx] || '0')])
        );
        continue;
      }

      // Parse line data
      if (currentFile && currentFunction) {
        const parts = trimmedLine.split(/\s+/);
        if (parts.length >= this.events.length + 1) {
          try {
            const lineNum = parseInt(parts[0]);
            const eventCounts = parts.slice(1, this.events.length + 1).map(x => parseInt(x));
            
            const lineData: LineData = {};
            eventCounts.forEach((count, idx) => {
              lineData[this.events[idx]] = count;
            });
            lineData.executed = eventCounts.some(count => count > 0);
            
            this.filesData[currentFile].functions[currentFunction].lines[lineNum] = lineData;
            
            // Update function totals
            eventCounts.forEach((count, idx) => {
              this.filesData[currentFile].functions[currentFunction].totals[this.events[idx]] += count;
            });
          } catch (e) {
            continue;
          }
        }
      }
    }

    // Calculate coverage statistics
    this.calculateCoverageStats();
    
    // Format output
    return this.formatOutput();
  }

  private calculateCoverageStats() {
    for (const [filePath, fileData] of Object.entries(this.filesData)) {
      const totalLines = new Set<number>();
      const coveredLines = new Set<number>();
      
      for (const [funcName, funcData] of Object.entries(fileData.functions)) {
        const funcCovered: number[] = [];
        const funcUncovered: number[] = [];
        
        for (const [lineNumStr, lineData] of Object.entries(funcData.lines)) {
          const lineNum = parseInt(lineNumStr);
          totalLines.add(lineNum);
          
          if (lineData.executed) {
            coveredLines.add(lineNum);
            funcCovered.push(lineNum);
          } else {
            funcUncovered.push(lineNum);
          }
        }
        
        funcData.coveredLines = funcCovered.sort((a, b) => a - b);
        funcData.uncoveredLines = funcUncovered.sort((a, b) => a - b);
        funcData.coveragePercentage = funcCovered.length > 0 
          ? (funcCovered.length / (funcCovered.length + funcUncovered.length)) * 100 
          : 0.0;
      }
      
      fileData.totalLines = totalLines.size;
      fileData.coveredLines = coveredLines.size;
      fileData.coveragePercentage = totalLines.size > 0 
        ? (coveredLines.size / totalLines.size) * 100 
        : 0.0;
    }
  }

  private formatOutput(): CachegrindData {
    // Calculate overall statistics
    const totalFiles = Object.keys(this.filesData).length;
    const totalLines = Object.values(this.filesData).reduce((sum, data) => sum + data.totalLines, 0);
    const totalCovered = Object.values(this.filesData).reduce((sum, data) => sum + data.coveredLines, 0);
    const overallCoverage = totalLines > 0 ? (totalCovered / totalLines) * 100 : 0.0;
    
    // Format file coverage data
    const fileCoverage: Record<string, FileCoverage> = {};
    
    for (const [filePath, fileData] of Object.entries(this.filesData)) {
      const filename = filePath.split('/').pop() || filePath;
      
      // Collect all covered/uncovered lines from all functions
      const allCovered = new Set<number>();
      const allUncovered = new Set<number>();
      
      for (const funcData of Object.values(fileData.functions)) {
        funcData.coveredLines.forEach(line => allCovered.add(line));
        funcData.uncoveredLines.forEach(line => allUncovered.add(line));
      }
      
      fileCoverage[filename] = {
        sourceFilePath: filePath,
        totalLines: fileData.totalLines,
        coveredLines: fileData.coveredLines,
        coveragePercentage: fileData.coveragePercentage,
        coveredLineNumbers: Array.from(allCovered).sort((a, b) => a - b),
        uncoveredLineNumbers: Array.from(allUncovered).sort((a, b) => a - b),
        sourceCode: this.getSourceCode(filePath) || fileData.sourceCode || `// Source file not available: ${filePath}`,
        functions: fileData.functions,
        cachegrindEvents: this.events
      };
    }
    
    return {
      projectName: `Cachegrind Analysis - ${this.cmd || 'Unknown Command'}`,
      analysisType: 'cachegrind',
      pid: this.pid,
      events: this.events,
      totalLines,
      coveredLines: totalCovered,
      coveragePercentage: overallCoverage,
      filesAnalyzed: totalFiles,
      fileCoverage,
      summaryTotals: this.summary,
      cachegrindFile: 'Uploaded File'
    };
  }
}