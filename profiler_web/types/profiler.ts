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
}

export interface FileCoverage {
  sourceFilePath: string;
  totalLines: number;
  coveredLines: number;
  coveragePercentage: number;
  coveredLineNumbers: number[];
  uncoveredLineNumbers: number[];
  sourceCode: string;
  functions: Record<string, FunctionData>;
  cachegrindEvents: string[];
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
}

export interface LineData {
  [event: string]: number | boolean;
  executed: boolean;
}

export interface ParsedFile {
  name: string;
  size: number;
  lastModified: number;
  content: string;
}