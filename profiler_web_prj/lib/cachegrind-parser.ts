import { CachegrindData, FileCoverage, FunctionData, LineData, PcLineData, CallInfo } from '@/types/profiler';
import { resolveSourcePath } from './path-utils';

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
    objectFile?: string;
  }> = {};
  private summary: Record<string, number> = {};
  private sourceFiles: Record<string, string> = {};
  private isCallgrind: boolean = false;
  private currentObjectFile: string | null = null;
  private positions: string = 'line';
  private pendingCallFile?: string;
  private pendingCallFunction?: string;

  constructor(
    private content: string,
    sourceFiles?: Record<string, string>
  ) {
    if (sourceFiles) {
      this.sourceFiles = sourceFiles;
    }
  }

  private getSourceCode(filePath: string): string | null {
    return resolveSourcePath(filePath, this.sourceFiles);
  }

  parse(): CachegrindData {
    const lines = this.content.split('\n');
    let currentFile: string | null = null;
    let currentFunction: string | null = null;

    // Check if it's callgrind format
    if (lines[0]?.trim() === '# callgrind format') {
      this.isCallgrind = true;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || (trimmedLine.startsWith('#') && !this.isCallgrind)) {
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

      if (trimmedLine.startsWith('positions:')) {
        this.positions = trimmedLine.split(':')[1].trim();
        continue;
      }

      if (trimmedLine.startsWith('part:')) {
        continue;
      }

      // Parse object file (callgrind specific)
      if (trimmedLine.startsWith('ob=')) {
        this.currentObjectFile = trimmedLine.substring(3);
        continue;
      }

      // Also handle cob= (called object)
      if (trimmedLine.startsWith('cob=')) {
        // For now, we can store it but not use it directly
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
            coveragePercentage: 0.0,
            objectFile: this.currentObjectFile || undefined
          };
        } else if (this.currentObjectFile) {
          // Update object file if we have a new one for this file
          this.filesData[currentFile].objectFile = this.currentObjectFile;
        }
        continue;
      }

      // Handle fi= (file include) and fe= (file end)
      if (trimmedLine.startsWith('fi=') || trimmedLine.startsWith('fe=')) {
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
            coveragePercentage: 0.0,
            pcData: this.isCallgrind ? {} : undefined
          };
        }
        continue;
      }

      // Handle cfi= (called file)
      if (trimmedLine.startsWith('cfi=')) {
        this.pendingCallFile = trimmedLine.substring(4);
        continue;
      }

      // Handle cfn= (called function)
      if (trimmedLine.startsWith('cfn=')) {
        this.pendingCallFunction = trimmedLine.substring(4);
        continue;
      }

      // Handle calls=count target position
      if (trimmedLine.startsWith('calls=')) {
        const parts = trimmedLine.substring(6).split(/\s+/);
        const callCount = parseInt(parts[0]) || 1;
        
        // Next line should have the source PC and events
        if (i + 1 < lines.length) {
          i++;
          const nextLine = lines[i].trim();
          const pcMatch = nextLine.match(/^(0x[0-9a-fA-F]+)/);
          if (pcMatch && currentFunction && currentFile) {
            const sourcePc = pcMatch[1];
            const currentFuncData = this.filesData[currentFile].functions[currentFunction];
            if (!currentFuncData.calls) {
              currentFuncData.calls = [];
            }
            currentFuncData.calls.push({
              targetFile: this.pendingCallFile,
              targetFunction: this.pendingCallFunction,
              count: callCount,
              sourcePc: sourcePc
            });
            // Reset pending call info
            this.pendingCallFile = undefined;
            this.pendingCallFunction = undefined;
          }
        }
        continue;
      }
      
      // Handle jcnd=, jump=
      if (trimmedLine.startsWith('jcnd=') || trimmedLine.startsWith('jump=')) {
        // Skip these for now, just consume the next line if it exists
        if (i + 1 < lines.length && lines[i + 1].trim().match(/^0x[0-9a-fA-F]/)) {
          i++; // Skip the next line
        }
        continue;
      }

      // Handle jfi= (jump file include)
      if (trimmedLine.startsWith('jfi=')) {
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
        
        if (this.isCallgrind && this.positions.includes('instr')) {
          // Callgrind format with PC: 0xPC line event1 event2 ...
          // Note: Callgrind uses abbreviated output - only non-zero values are shown
          if (parts[0]?.startsWith('0x') && parts.length >= 3) {
            try {
              const pc = parts[0];
              const lineNum = parseInt(parts[1]);
              // Only take as many event counts as are present in the line
              const providedEventCounts = parts.slice(2).map(x => parseInt(x));
              // Fill in zeros for missing events
              const eventCounts = this.events.map((_, idx) => 
                idx < providedEventCounts.length ? providedEventCounts[idx] : 0
              );
              
              // Store in both line-based and PC-based structures
              const lineData: LineData = {};
              const pcLineData: PcLineData = {
                pc,
                line: lineNum,
                events: {},
                executed: false
              };
              
              eventCounts.forEach((count, idx) => {
                lineData[this.events[idx]] = count;
                pcLineData.events[this.events[idx]] = count;
              });
              
              lineData.executed = eventCounts.some(count => count > 0);
              pcLineData.executed = lineData.executed;
              
              // Store in line data
              if (!this.filesData[currentFile].functions[currentFunction].lines[lineNum]) {
                this.filesData[currentFile].functions[currentFunction].lines[lineNum] = {
                  executed: false
                };
              }
              
              // Aggregate events for the same line
              const existingLineData = this.filesData[currentFile].functions[currentFunction].lines[lineNum];
              eventCounts.forEach((count, idx) => {
                const event = this.events[idx];
                existingLineData[event] = (existingLineData[event] as number || 0) + count;
              });
              existingLineData.executed = existingLineData.executed || lineData.executed;
              
              // Store PC data
              if (this.filesData[currentFile].functions[currentFunction].pcData) {
                this.filesData[currentFile].functions[currentFunction].pcData![pc] = pcLineData;
              }
              
              // Update function totals
              eventCounts.forEach((count, idx) => {
                this.filesData[currentFile].functions[currentFunction].totals[this.events[idx]] += count;
              });
            } catch (e) {
              continue;
            }
          }
        } else {
          // Traditional cachegrind format: line event1 event2 ...
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
    }

    // Post-processing
    const fileCoverage: Record<string, FileCoverage> = {};
    let totalProjectLines = 0;
    let totalProjectCoveredLines = 0;

    for (const [filePath, fileInfo] of Object.entries(this.filesData)) {
      const coveredLineNumbers = new Set<number>();
      const uncoveredLineNumbers = new Set<number>();
      let maxLine = 0;

      // Collect all line information
      for (const [funcName, funcData] of Object.entries(fileInfo.functions)) {
        for (const [lineNumStr, lineData] of Object.entries(funcData.lines)) {
          const lineNum = parseInt(lineNumStr);
          maxLine = Math.max(maxLine, lineNum);
          
          if (lineData.executed) {
            coveredLineNumbers.add(lineNum);
            funcData.coveredLines.push(lineNum);
          } else {
            uncoveredLineNumbers.add(lineNum);
            funcData.uncoveredLines.push(lineNum);
          }
        }
        
        // Calculate function coverage
        // Only count lines with PC data (compiled lines)
        const totalFuncCompiledLines = funcData.coveredLines.length + funcData.uncoveredLines.length;
        funcData.coveragePercentage = totalFuncCompiledLines > 0
          ? (funcData.coveredLines.length / totalFuncCompiledLines) * 100
          : 0;
      }

      // Try to get source code
      const sourceCode = this.getSourceCode(filePath);
      const actualTotalLines = sourceCode ? sourceCode.split('\n').length : maxLine;
      
      // Calculate coverage based only on compiled lines (lines with PC data)
      // Non-compiled lines (comments, blank lines, etc.) are excluded
      const compiledLineCount = coveredLineNumbers.size + uncoveredLineNumbers.size;
      const coveredLines = coveredLineNumbers.size;
      const coveragePercentage = compiledLineCount > 0
        ? (coveredLines / compiledLineCount) * 100
        : 0;

      // Update project totals to only count compiled lines
      totalProjectLines += compiledLineCount;
      totalProjectCoveredLines += coveredLines;

      fileCoverage[filePath] = {
        sourceFilePath: filePath,
        totalLines: actualTotalLines,
        compiledLines: compiledLineCount,
        coveredLines,
        coveragePercentage,
        coveredLineNumbers: Array.from(coveredLineNumbers).sort((a, b) => a - b),
        uncoveredLineNumbers: Array.from(uncoveredLineNumbers).sort((a, b) => a - b),
        sourceCode: sourceCode || 'Source code not available',
        functions: fileInfo.functions,
        cachegrindEvents: this.events,
        objectFile: fileInfo.objectFile
      };
    }

    const coveragePercentage = totalProjectLines > 0
      ? (totalProjectCoveredLines / totalProjectLines) * 100
      : 0;

    return {
      projectName: this.cmd || 'Unknown',
      analysisType: this.isCallgrind ? 'callgrind' : 'cachegrind',
      pid: this.pid,
      events: this.events,
      totalLines: totalProjectLines,
      coveredLines: totalProjectCoveredLines,
      coveragePercentage,
      filesAnalyzed: Object.keys(fileCoverage).length,
      fileCoverage,
      summaryTotals: this.summary,
      cachegrindFile: '',
      isCallgrind: this.isCallgrind
    };
  }
}