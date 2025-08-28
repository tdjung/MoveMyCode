export interface CachegrindData {
  projectName: string;
  analysisType: 'cachegrind' | 'callgrind';
  pid: string;
  events: string[];
  totalLines: number;
  coveredLines: number;
  coveragePercentage: number;
  filesAnalyzed: number;
  fileCoverage: Record<string, FileCoverage>;
  summaryTotals: Record<string, number>;
  cachegrindFile: string;
  isCallgrind?: boolean;
}

export interface FileCoverage {
  sourceFilePath: string;
  totalLines: number;
  compiledLines: number;
  coveredLines: number;
  coveragePercentage: number;
  coveredLineNumbers: number[];
  uncoveredLineNumbers: number[];
  sourceCode: string;
  functions: Record<string, FunctionData>;
  cachegrindEvents: string[];
  objectFile?: string;
  assemblyData?: AssemblyData;
}

export interface FunctionData {
  lines: Record<number, LineData>;
  totals: Record<string, number>;
  coveredLines: number[];
  uncoveredLines: number[];
  coveragePercentage: number;
  startLine?: number;
  endLine?: number;
  file?: string;
  pcData?: Record<string, PcLineData>; // PC -> line mapping
  calls?: CallInfo[]; // Function calls made by this function
}

export interface CallInfo {
  targetFile?: string; // cfi: target file
  targetFunction?: string; // cfn: target function name
  count: number; // number of calls
  sourcePc: string; // PC where the call is made
  sourceLine?: number; // line number where the call is made
}

export interface LineData {
  [event: string]: number | boolean;
  executed: boolean;
}

export interface PcLineData {
  pc: string;
  line: number;
  events: Record<string, number>;
  executed: boolean;
}

export interface AssemblyData {
  startAddress: string;
  endAddress: string;
  instructions: AssemblyInstruction[];
}

export interface AssemblyInstruction {
  pc: string;
  instruction: string;
  events?: Record<string, number>;
  executed?: boolean;
}

export interface ParsedFile {
  name: string;
  size: number;
  lastModified: number;
  content: string;
}

export interface CallTreeNode {
  id: string;
  functionName: string;
  fileName: string;
  pcStart: string;
  pcEnd: string;
  callCount: number;
  totalTime: number;
  selfTime: number;
  children: CallTreeNode[];
  calls?: CallInfo[];
}