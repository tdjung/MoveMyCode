'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText, Activity, BarChart3, ChevronDown, Code2, FolderOpen, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeft, GitBranch, Settings, X, Search } from 'lucide-react';
import { availableSrcSubdirectories } from '@/lib/src-directories';
import { cn, formatPercentage, getCoverageColor, getCoverageBgColor } from '@/lib/utils';
import { CachegrindData } from '@/types/profiler';

interface SidebarProps {
  data: CachegrindData;
  selectedFile: string | null;
  selectedFunction: string | null;
  onFileSelect: (filename: string | null) => void;
  onFunctionSelect: (funcName: string | null, fileName: string | null) => void;
  onReset?: () => void;
  onCallTreeView?: () => void;
  isCallTreeActive?: boolean;
}

type ViewMode = 'files' | 'functions';

export function Sidebar({ data, selectedFile, selectedFunction, onFileSelect, onFunctionSelect, onReset, onCallTreeView, isCallTreeActive = false }: SidebarProps) {
  const [sortBy, setSortBy] = useState<string>('coverage');
  const [sortAscending, setSortAscending] = useState<boolean>(false);
  const [sortByInclusive, setSortByInclusive] = useState<boolean>(false); // For functions view
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [srcSubdir, setSrcSubdir] = useState<string>('');
  const [availableSubdirs, setAvailableSubdirs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [objdumpCommand, setObjdumpCommand] = useState<string>('objdump');
  const [functionPadding, setFunctionPadding] = useState<number>(5);
  
  // Load saved settings from localStorage and get available subdirectories
  useEffect(() => {
    const savedSubdir = localStorage.getItem('profiler-src-subdir');
    if (savedSubdir) {
      setSrcSubdir(savedSubdir);
    }
    
    const savedObjdump = localStorage.getItem('profiler-objdump-command');
    if (savedObjdump) {
      setObjdumpCommand(savedObjdump);
    }
    
    const savedPadding = localStorage.getItem('profiler-function-padding');
    if (savedPadding) {
      setFunctionPadding(parseInt(savedPadding, 10));
    }
    
    // Set available subdirectories from static list
    setAvailableSubdirs(availableSrcSubdirectories);
  }, []);
  
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
  
  // Cache calculated inclusive totals and call counts
  const functionsWithInclusiveTotals = useMemo(() => {
    const functions: Array<{ name: string; file: string; data: any; inclusiveTotals: Record<string, number>; callCount: number }> = [];
    
    // First pass: collect all functions and calculate inclusive totals
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        // Calculate inclusive totals
        const inclusiveTotals: Record<string, number> = { ...funcData.totals };
        
        // Add inclusive counts from calls
        if (funcData.calls && Array.isArray(funcData.calls)) {
          funcData.calls.forEach((call: any) => {
            if (call.inclusiveEvents) {
              Object.entries(call.inclusiveEvents).forEach(([event, count]) => {
                inclusiveTotals[event] = (inclusiveTotals[event] || 0) + (count as number);
              });
            }
          });
        }
        
        functions.push({
          name: funcName,
          file: filename,
          data: funcData,
          inclusiveTotals,
          callCount: 0 // Will be calculated in second pass
        });
      });
    });
    
    // Second pass: calculate how many times each function is called
    Object.entries(data.fileCoverage).forEach(([_, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([__, funcData]) => {
        if (funcData.calls && Array.isArray(funcData.calls)) {
          funcData.calls.forEach((call: any) => {
            if (call.targetFunction) {
              // Find the target function and increment its call count
              const targetFunc = functions.find(f => 
                f.name === call.targetFunction && 
                (call.targetFile ? f.file === call.targetFile : true)
              );
              if (targetFunc) {
                targetFunc.callCount += call.count || 1;
              }
            }
          });
        }
      });
    });
    
    return functions;
  }, [data]);

  // Get all functions across all files with sorting
  const getAllFunctions = () => {
    return functionsWithInclusiveTotals.sort((a, b) => {
      const aValue = sortBy === 'coverage' 
        ? a.data.coveragePercentage 
        : sortByInclusive && sortBy !== 'coverage'
          ? (a.inclusiveTotals[sortBy] || 0)
          : (a.data.totals[sortBy] || 0);
      const bValue = sortBy === 'coverage' 
        ? b.data.coveragePercentage 
        : sortByInclusive && sortBy !== 'coverage'
          ? (b.inclusiveTotals[sortBy] || 0)
          : (b.data.totals[sortBy] || 0);
      return sortAscending ? aValue - bValue : bValue - aValue;
    });
  };
  
  const files = Object.entries(data.fileCoverage).sort((a, b) => {
    const aValue = getFileMetric(a[1], sortBy);
    const bValue = getFileMetric(b[1], sortBy);
    return sortAscending ? aValue - bValue : bValue - aValue;
  });

  const functions = getAllFunctions();

  // Filter files and functions based on search query
  const filteredFiles = files.filter(([filename]) => 
    filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (filename.split('/').pop() || filename).toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredFunctions = functions.filter((func) =>
    func.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (func.file.split('/').pop() || func.file).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <h1 className="text-xl font-bold mb-2">Profiler Analysis</h1>
        <p className="text-sm opacity-90">{data.projectName}</p>
      </div>

      {/* Buttons */}
      <div className="p-4 space-y-3">
        {/* New Analysis and Settings Buttons */}
        {onReset && (
          <div className="flex gap-2">
            <button
              onClick={onReset}
              className="flex-1 px-3 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>New Analysis</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-3 rounded-lg transition-all duration-200 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {/* Overview Dashboard Button */}
        <button
          onClick={() => {
            onFileSelect(null);
            onFunctionSelect(null, null);
          }}
          className={cn(
            "w-full px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3",
            !selectedFile && !selectedFunction && !isCallTreeActive
              ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          <BarChart3 className="w-5 h-5" />
          <span>Overview Dashboard</span>
        </button>
        
        {/* Call Tree Viewer Button */}
        {onCallTreeView && (
          <button
            onClick={onCallTreeView}
            className={cn(
              "w-full px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-3",
              isCallTreeActive
                ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            <GitBranch className="w-5 h-5" />
            <span>Call Tree Viewer</span>
          </button>
        )}
      </div>


      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files and functions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
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
          <div className="flex items-center gap-1">
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
            {viewMode === 'functions' && sortBy !== 'coverage' && (
              <button
                onClick={() => setSortByInclusive(!sortByInclusive)}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                title={sortByInclusive ? "Sort by self time" : "Sort by inclusive time"}
              >
                {sortByInclusive ? 'Incl' : 'Self'}
              </button>
            )}
            <button
              onClick={() => setSortAscending(!sortAscending)}
              className="p-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              title={sortAscending ? "Sort descending" : "Sort ascending"}
            >
              {sortAscending ? (
                <ArrowUp className="w-3 h-3 text-gray-600" />
              ) : (
                <ArrowDown className="w-3 h-3 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="px-2 pb-1">
        {viewMode === 'files' ? (
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500 font-medium border-b border-gray-200">
            <FileText className="w-3 h-3 opacity-0" />
            {sortBy === 'coverage' ? (
              <>
                <span className="w-12 text-center">%</span>
                <span className="w-16 text-center">Lines</span>
              </>
            ) : (
              <span className="w-20 text-right">{getMetricDescription(sortBy)}</span>
            )}
            <span className="flex-1">File Name</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500 font-medium border-b border-gray-200">
            <Code2 className="w-3 h-3 opacity-0" />
            {sortBy === 'coverage' ? (
              <>
                <span className="w-12 text-center">%</span>
                <span className="w-16 text-center">Lines</span>
              </>
            ) : (
              <>
                <span className="w-10 text-right">Calls</span>
                <span className="text-right" style={{ minWidth: '60px' }}>Inclusive</span>
                <span className="text-right" style={{ minWidth: '60px' }}>Self</span>
              </>
            )}
            <span className="flex-1">Function Name</span>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 pb-4">
          {viewMode === 'files' ? (
            // Files list
            filteredFiles.map(([filename, fileData]) => (
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
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  {sortBy === 'coverage' ? (
                    <>
                      <span className={cn(
                        "text-xs font-medium px-1.5 py-0.5 rounded w-12 text-center",
                        getCoverageColor(fileData.coveragePercentage),
                        getCoverageBgColor(fileData.coveragePercentage)
                      )}>
                        {formatPercentage(fileData.coveragePercentage)}
                      </span>
                      <span className="text-xs text-gray-500 w-16 text-center">
                        {fileData.coveredLines}/{fileData.compiledLines}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-gray-700 w-20 text-right">
                      {getFileMetric(fileData, sortBy).toLocaleString()}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-700 truncate flex-1" title={filename}>
                    {filename.split('/').pop() || filename}
                  </span>
                </div>
              </button>
            ))
          ) : (
            // Functions list
            filteredFunctions.map((func) => (
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
                <div className="flex items-center gap-2">
                  <Code2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  {sortBy === 'coverage' ? (
                    <>
                      <span className={cn(
                        "text-xs font-medium px-1.5 py-0.5 rounded w-12 text-center",
                        getCoverageColor(func.data.coveragePercentage),
                        getCoverageBgColor(func.data.coveragePercentage)
                      )}>
                        {formatPercentage(func.data.coveragePercentage)}
                      </span>
                      <span className="text-xs text-gray-500 w-16 text-center">
                        {func.data.coveredLines?.length || 0}/{(func.data.coveredLines?.length || 0) + (func.data.uncoveredLines?.length || 0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span 
                        className="text-xs font-medium text-gray-500 w-10 text-right"
                        title={`Called ${func.callCount} time${func.callCount !== 1 ? 's' : ''}`}
                      >
                        {func.callCount > 0 ? func.callCount.toLocaleString() : '-'}
                      </span>
                      <span 
                        className="text-xs font-medium text-gray-700 text-right"
                        style={{ minWidth: '60px' }}
                        title={`Inclusive ${getMetricDescription(sortBy)}`}
                      >
                        {(func.inclusiveTotals[sortBy] || 0).toLocaleString()}
                      </span>
                      <span 
                        className="text-xs font-medium text-gray-600 text-right"
                        style={{ minWidth: '60px' }}
                        title={`Self ${getMetricDescription(sortBy)}`}
                      >
                        {(func.data.totals[sortBy] || 0).toLocaleString()}
                      </span>
                    </>
                  )}
                  <span className="text-sm font-medium text-gray-700 truncate flex-1" title={`${func.name} (${func.file})`}>
                    {func.name}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source Directory
                </label>
                <select
                  value={srcSubdir}
                  onChange={(e) => setSrcSubdir(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">src/ (root)</option>
                  {availableSubdirs.filter(dir => dir !== '').map(dir => (
                    <option key={dir} value={dir}>src/{dir}/</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Select the src subdirectory where your source files are located. The system will intelligently map file paths to this directory.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Objdump Command
                </label>
                <input
                  type="text"
                  value={objdumpCommand}
                  onChange={(e) => setObjdumpCommand(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="objdump"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Command to use for disassembly. For example: riscv32-unknown-elf-objdump
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Function View Padding Lines
                </label>
                <input
                  type="number"
                  value={functionPadding}
                  onChange={(e) => setFunctionPadding(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  max="50"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Number of extra lines to show before and after functions (0-50)
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Save settings to localStorage
                  localStorage.setItem('profiler-src-subdir', srcSubdir);
                  localStorage.setItem('profiler-objdump-command', objdumpCommand);
                  localStorage.setItem('profiler-function-padding', functionPadding.toString());
                  setShowSettings(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}