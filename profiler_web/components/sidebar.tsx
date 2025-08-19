'use client';

import { useState } from 'react';
import { FileText, Activity, BarChart3, ChevronDown, Code2, FolderOpen } from 'lucide-react';
import { cn, formatPercentage, getCoverageColor, getCoverageBgColor } from '@/lib/utils';
import { CachegrindData } from '@/types/profiler';

interface SidebarProps {
  data: CachegrindData;
  selectedFile: string | null;
  selectedFunction: string | null;
  onFileSelect: (filename: string | null) => void;
  onFunctionSelect: (funcName: string | null, fileName: string | null) => void;
}

type ViewMode = 'files' | 'functions';

export function Sidebar({ data, selectedFile, selectedFunction, onFileSelect, onFunctionSelect }: SidebarProps) {
  const [sortBy, setSortBy] = useState<string>('coverage');
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  
  // Calculate total metrics for each file
  const getFileMetric = (fileData: any, metric: string): number => {
    if (metric === 'coverage') {
      return fileData.coveragePercentage;
    }
    
    // Sum up the metric from all functions in the file
    let total = 0;
    Object.values(fileData.functions || {}).forEach((func: any) => {
      total += func.totals[metric] || 0;
    });
    return total;
  };
  
  // Get metric description
  const getMetricDescription = (metric: string): string => {
    const descriptions: Record<string, string> = {
      'coverage': 'Code Coverage',
      'Ir': 'Instructions',
      'Cy': 'CPU Cycles',
      'Dr': 'Data Reads',
      'Dw': 'Data Writes',
      'Bc': 'Branches',
      'Bcm': 'Branch Misses'
    };
    return descriptions[metric] || metric;
  };
  
  // Get all functions across all files
  const getAllFunctions = () => {
    const functions: Array<{ name: string; file: string; data: any }> = [];
    
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        functions.push({
          name: funcName,
          file: filename,
          data: funcData
        });
      });
    });
    
    return functions.sort((a, b) => {
      const aValue = sortBy === 'coverage' 
        ? a.data.coveragePercentage 
        : (a.data.totals[sortBy] || 0);
      const bValue = sortBy === 'coverage' 
        ? b.data.coveragePercentage 
        : (b.data.totals[sortBy] || 0);
      return bValue - aValue;
    });
  };
  
  const files = Object.entries(data.fileCoverage).sort((a, b) => {
    const aValue = getFileMetric(a[1], sortBy);
    const bValue = getFileMetric(b[1], sortBy);
    return bValue - aValue;
  });

  const functions = getAllFunctions();

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <h1 className="text-xl font-bold mb-2">Profiler Analysis</h1>
        <p className="text-sm opacity-90">{data.projectName}</p>
      </div>

      {/* Overview Button */}
      <div className="p-4">
        <button
          onClick={() => {
            onFileSelect(null);
            onFunctionSelect(null, null);
          }}
          className={cn(
            "w-full px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3",
            !selectedFile && !selectedFunction
              ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          <BarChart3 className="w-5 h-5" />
          <span>Overview Dashboard</span>
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs">Coverage</span>
            </div>
            <p className={cn("text-xl font-bold", getCoverageColor(data.coveragePercentage))}>
              {formatPercentage(data.coveragePercentage)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-xs">Files</span>
            </div>
            <p className="text-xl font-bold text-gray-800">
              {data.filesAnalyzed}
            </p>
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="px-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('files')}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
              viewMode === 'files'
                ? "bg-blue-100 text-blue-700 border border-blue-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <FolderOpen className="w-4 h-4" />
            Source Files
          </button>
          <button
            onClick={() => setViewMode('functions')}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
              viewMode === 'functions'
                ? "bg-blue-100 text-blue-700 border border-blue-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <Code2 className="w-4 h-4" />
            Functions
          </button>
        </div>
      </div>

      {/* Sort Control */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
            {viewMode === 'files' ? 'Source Files' : 'Functions'}
          </h3>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs pl-2 pr-6 py-1 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
              title={`Sort ${viewMode} by`}
            >
              <option value="coverage">Coverage</option>
              <option value="Ir">Instructions</option>
              <option value="Cy">Cycles</option>
              <option value="Dr">Data Reads</option>
              <option value="Dw">Data Writes</option>
              <option value="Bc">Branches</option>
              <option value="Bcm">Branch Misses</option>
            </select>
            <ChevronDown className="absolute right-1 top-1.5 w-3 h-3 text-gray-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 pb-4">
          {viewMode === 'files' ? (
            // Files list
            files.map(([filename, fileData]) => (
              <button
                key={filename}
                onClick={() => {
                  onFileSelect(filename);
                  onFunctionSelect(null, null);
                }}
                className={cn(
                  "w-full px-3 py-2 rounded-lg mb-1 text-left transition-all duration-200",
                  selectedFile === filename && !selectedFunction
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-gray-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">
                      {filename}
                    </span>
                  </div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    sortBy === 'coverage' ? [
                      getCoverageColor(fileData.coveragePercentage),
                      getCoverageBgColor(fileData.coveragePercentage)
                    ] : "text-gray-700 bg-gray-100"
                  )}>
                    {sortBy === 'coverage' 
                      ? formatPercentage(fileData.coveragePercentage)
                      : getFileMetric(fileData, sortBy).toLocaleString()
                    }
                  </span>
                </div>
                <div className="ml-6 mt-1">
                  <span className="text-xs text-gray-500">
                    {sortBy === 'coverage' 
                      ? `${fileData.coveredLines} / ${fileData.totalLines} lines`
                      : getMetricDescription(sortBy)
                    }
                  </span>
                </div>
              </button>
            ))
          ) : (
            // Functions list
            functions.map((func) => (
              <button
                key={`${func.file}:${func.name}`}
                onClick={() => {
                  onFileSelect(func.file);
                  onFunctionSelect(func.name, func.file);
                }}
                className={cn(
                  "w-full px-3 py-2 rounded-lg mb-1 text-left transition-all duration-200",
                  selectedFunction === func.name && selectedFile === func.file
                    ? "bg-blue-50 border border-blue-200"
                    : "hover:bg-gray-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Code2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-700 block truncate">
                        {func.name}
                      </span>
                      <span className="text-xs text-gray-500 block truncate">
                        {func.file}
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    sortBy === 'coverage' ? [
                      getCoverageColor(func.data.coveragePercentage),
                      getCoverageBgColor(func.data.coveragePercentage)
                    ] : "text-gray-700 bg-gray-100"
                  )}>
                    {sortBy === 'coverage' 
                      ? formatPercentage(func.data.coveragePercentage)
                      : (func.data.totals[sortBy] || 0).toLocaleString()
                    }
                  </span>
                </div>
                <div className="ml-6 mt-1">
                  <span className="text-xs text-gray-500">
                    {sortBy === 'coverage' 
                      ? `${func.data.coveredLines?.length || 0} / ${Object.keys(func.data.lines).length} lines`
                      : getMetricDescription(sortBy)
                    }
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}