'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Code, Activity, Cpu, Zap, GitBranch, AlertCircle, Settings, Eye, Code2, Sun, Moon } from 'lucide-react';
import { FileCoverage, FunctionData } from '@/types/profiler';
import { formatPercentage, getCoverageColor, cn } from '@/lib/utils';
import Prism from 'prismjs';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import { AssemblyViewer } from './assembly-viewer';

// Custom CSS for unified dark theme code display
const codeStyles = `
  .code-viewer table,
  .assembly-viewer table {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  }
  .code-viewer td,
  .assembly-viewer td {
    padding-top: 0;
    padding-bottom: 0;
    line-height: 1.5;
  }
  .code-viewer pre,
  .assembly-viewer pre {
    margin: 0;
    padding: 0;
    background: transparent;
  }
  .code-viewer code {
    background: transparent;
  }
  
  /* Dark theme syntax highlighting */
  .dark-theme .token.comment,
  .dark-theme .token.prolog,
  .dark-theme .token.doctype,
  .dark-theme .token.cdata {
    color: #6A9955;
    font-style: italic;
  }
  
  .dark-theme .token.punctuation {
    color: #D4D4D4;
  }
  
  .dark-theme .token.property,
  .dark-theme .token.tag,
  .dark-theme .token.boolean,
  .dark-theme .token.number,
  .dark-theme .token.constant,
  .dark-theme .token.symbol,
  .dark-theme .token.deleted {
    color: #569CD6;
  }
  
  .dark-theme .token.selector,
  .dark-theme .token.attr-name,
  .dark-theme .token.string,
  .dark-theme .token.char,
  .dark-theme .token.builtin,
  .dark-theme .token.inserted {
    color: #CE9178;
  }
  
  .dark-theme .token.operator,
  .dark-theme .token.entity,
  .dark-theme .token.url,
  .dark-theme .language-css .token.string,
  .dark-theme .style .token.string {
    color: #D4D4D4;
  }
  
  .dark-theme .token.atrule,
  .dark-theme .token.attr-value,
  .dark-theme .token.keyword {
    color: #C586C0;
  }
  
  .dark-theme .token.function,
  .dark-theme .token.class-name {
    color: #DCDCAA;
  }
  
  .dark-theme .token.regex,
  .dark-theme .token.important {
    color: #D16969;
  }
  
  .dark-theme .token.variable {
    color: #9CDCFE;
  }
  
  /* Default text color for variables and plain text */
  .dark-theme code,
  .dark-theme pre {
    color: #D4D4D4;
  }
  
  /* Light theme syntax highlighting */
  .light-theme .token.comment,
  .light-theme .token.prolog,
  .light-theme .token.doctype,
  .light-theme .token.cdata {
    color: #008000;
    font-style: italic;
  }
  
  .light-theme .token.punctuation {
    color: #393A34;
  }
  
  .light-theme .token.property,
  .light-theme .token.tag,
  .light-theme .token.boolean,
  .light-theme .token.number,
  .light-theme .token.constant,
  .light-theme .token.symbol,
  .light-theme .token.deleted {
    color: #0000FF;
  }
  
  .light-theme .token.selector,
  .light-theme .token.attr-name,
  .light-theme .token.string,
  .light-theme .token.char,
  .light-theme .token.builtin,
  .light-theme .token.inserted {
    color: #A31515;
  }
  
  .light-theme .token.operator,
  .light-theme .token.entity,
  .light-theme .token.url,
  .light-theme .language-css .token.string,
  .light-theme .style .token.string {
    color: #393A34;
  }
  
  .light-theme .token.atrule,
  .light-theme .token.attr-value,
  .light-theme .token.keyword {
    color: #AF00DB;
  }
  
  .light-theme .token.function,
  .light-theme .token.class-name {
    color: #795E26;
  }
  
  .light-theme .token.regex,
  .light-theme .token.important,
  .light-theme .token.variable {
    color: #001080;
  }
  
  /* Highlight styles for linked lines */
  .code-line-highlight {
    background-color: rgba(59, 130, 246, 0.2) !important;
    outline: 2px solid rgba(59, 130, 246, 0.5);
    outline-offset: -2px;
  }
  
  .assembly-line-highlight {
    background-color: rgba(59, 130, 246, 0.3) !important;
    outline: 2px solid rgba(59, 130, 246, 0.6);
    outline-offset: -2px;
  }
`;

interface FileViewerProps {
  filename: string;
  fileData: FileCoverage;
  selectedFunction?: string | null;
}

interface HotspotSettings {
  event: string;
  threshold: number;
}

export function FileViewer({ filename, fileData, selectedFunction }: FileViewerProps) {
  // Handle missing or empty source code
  const sourceCode = fileData?.sourceCode || '';
  const hasSourceCode = sourceCode && 
    !sourceCode.includes('Source code not available') && 
    !sourceCode.includes('Source file not available') &&
    !sourceCode.startsWith('//') &&
    sourceCode.trim().length > 0;
  
  const allLines = sourceCode.split('\n');
  
  // Get function data and line range
  const functionData = selectedFunction ? fileData.functions?.[selectedFunction] : null;
  const functionLineNumbers = functionData ? Object.keys(functionData.lines || {}).map(Number).sort((a, b) => a - b) : [];
  const minLine = functionLineNumbers.length > 0 ? Math.min(...functionLineNumbers) : 1;
  const maxLine = functionLineNumbers.length > 0 ? Math.max(...functionLineNumbers) : allLines.length;
  
  // If function is selected, show only function lines
  const lines = selectedFunction && functionData ? 
    allLines.slice(minLine - 1, maxLine) : 
    allLines;
  
  const lineOffset = selectedFunction && functionData ? minLine - 1 : 0;
  
  const coveredSet = new Set(fileData?.coveredLineNumbers || []);
  const uncoveredSet = new Set(fileData?.uncoveredLineNumbers || []);

  // State for metric display
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(['Ir']));
  const [hotspotSettings, setHotspotSettings] = useState<HotspotSettings>({
    event: 'Ir',
    threshold: 10000
  });
  const [splitPosition, setSplitPosition] = useState(50); // Percentage for split view
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  
  // State for highlighted lines
  const [highlightedCodeLine, setHighlightedCodeLine] = useState<number | null>(null);
  const [highlightedAssemblyPc, setHighlightedAssemblyPc] = useState<string | null>(null);
  
  // State for theme
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [syntaxOnlyMode, setSyntaxOnlyMode] = useState(false);

  // Calculate total metrics from functions or selected function
  const calculateTotalMetrics = () => {
    const metrics: Record<string, number> = {};
    
    if (selectedFunction && functionData) {
      // Use only selected function metrics
      Object.entries(functionData.totals || {}).forEach(([event, value]) => {
        metrics[event] = value;
      });
    } else {
      // Use all functions
      const functions = fileData.functions || {};
      Object.values(functions).forEach(func => {
        Object.entries(func.totals || {}).forEach(([event, value]) => {
          metrics[event] = (metrics[event] || 0) + value;
        });
      });
    }
    
    return metrics;
  };

  const totalMetrics = calculateTotalMetrics();
  const availableEvents = fileData?.cachegrindEvents || [];

  // Calculate IPC (Instructions Per Cycle)
  const instructions = totalMetrics['Ir'] || 0;
  const cycles = totalMetrics['Cy'] || 0;
  const ipc = cycles > 0 ? (instructions / cycles).toFixed(2) : '0.00';
  
  // Get all PC data for mapping
  const allPcData = selectedFunction && functionData 
    ? functionData.pcData || {}
    : Object.values(fileData.functions || {}).reduce((acc, func) => ({...acc, ...func.pcData}), {});
  
  // Create mappings between lines and PC addresses
  const lineToPcMap = useCallback(() => {
    const map = new Map<number, string[]>();
    Object.entries(allPcData).forEach(([pc, data]: [string, any]) => {
      if (data.line) {
        if (!map.has(data.line)) {
          map.set(data.line, []);
        }
        map.get(data.line)!.push(pc);
      }
    });
    return map;
  }, [allPcData]);
  
  const pcToLineMap = useCallback(() => {
    const map = new Map<string, number>();
    Object.entries(allPcData).forEach(([pc, data]: [string, any]) => {
      if (data.line) {
        map.set(pc, data.line);
      }
    });
    return map;
  }, [allPcData]);

  // Get event description - updated to show "Instructions" instead of "Instructions Retired"
  const getEventDescription = (event: string) => {
    const descriptions: Record<string, string> = {
      'Ir': 'Instructions',
      'I1mr': 'I1 Cache Misses',
      'ILmr': 'IL Cache Misses',
      'Dr': 'Data Cache Reads',
      'D1mr': 'D1 Cache Read Misses',
      'DLmr': 'DL Cache Read Misses',
      'Dw': 'Data Cache Writes',
      'D1mw': 'D1 Cache Write Misses',
      'DLmw': 'DL Cache Write Misses',
      'Bc': 'Conditional Branches',
      'Bcm': 'Conditional Branch Mispredicts',
      'Bi': 'Indirect Branches',
      'Bim': 'Indirect Branch Mispredicts',
      'Cy': 'Cycles'
    };
    return descriptions[event] || event;
  };

  // Get line metrics
  const getLineMetrics = (lineNumber: number): Record<string, number> => {
    const metrics: Record<string, number> = {};
    
    if (selectedFunction && functionData) {
      // Use only selected function metrics
      const lineData = functionData.lines?.[lineNumber];
      if (lineData) {
        Object.entries(lineData).forEach(([event, value]) => {
          if (typeof value === 'number' && event !== 'executed') {
            metrics[event] = value;
          }
        });
      }
    } else {
      // Use all functions
      const functions = fileData.functions || {};
      Object.values(functions).forEach(func => {
        if (func.lines && func.lines[lineNumber]) {
          const lineData = func.lines[lineNumber];
          Object.entries(lineData).forEach(([event, value]) => {
            if (typeof value === 'number' && event !== 'executed') {
              metrics[event] = (metrics[event] || 0) + value;
            }
          });
        }
      });
    }
    
    return metrics;
  };

  // Check if line is a hotspot
  const isHotspot = (lineNumber: number): boolean => {
    const lineMetrics = getLineMetrics(lineNumber);
    const value = lineMetrics[hotspotSettings.event] || 0;
    return value > hotspotSettings.threshold;
  };
  
  // Handle code line click
  const handleCodeLineClick = useCallback((lineNumber: number) => {
    setHighlightedCodeLine(lineNumber);
    // Find corresponding PC addresses
    const lineToPC = lineToPcMap();
    const pcs = lineToPC.get(lineNumber);
    if (pcs && pcs.length > 0) {
      setHighlightedAssemblyPc(pcs[0]); // Highlight first PC for this line
    } else {
      setHighlightedAssemblyPc(null);
    }
  }, [lineToPcMap]);
  
  // Handle assembly line click (passed to AssemblyViewer)
  const handleAssemblyLineClick = useCallback((pc: string) => {
    setHighlightedAssemblyPc(pc);
    // Find corresponding source line
    const pcToLine = pcToLineMap();
    const lineNumber = pcToLine.get(pc);
    if (lineNumber !== undefined) {
      setHighlightedCodeLine(lineNumber);
    } else {
      setHighlightedCodeLine(null);
    }
  }, [pcToLineMap]);

  // Get language for syntax highlighting
  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'c':
        return 'c';
      case 'cpp':
      case 'cc':
      case 'cxx':
      case 'hpp':
      case 'h':
        return 'cpp';
      default:
        return 'none';
    }
  };

  // Handle split resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return;

      const container = splitContainerRef.current;
      const rect = container.getBoundingClientRect();
      const newPosition = ((e.clientY - rect.top) / rect.height) * 100;
      
      // Limit the split position between 20% and 80%
      setSplitPosition(Math.max(20, Math.min(80, newPosition)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Apply syntax highlighting and styles
  useEffect(() => {
    if (hasSourceCode) {
      Prism.highlightAll();
    }
    
    // Add custom styles
    const styleId = 'code-viewer-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.innerHTML = codeStyles;
      document.head.appendChild(styleElement);
    }
    
    return () => {
      // Cleanup on unmount
      if (styleElement && document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, [hasSourceCode, sourceCode, selectedFunction]);

  // Calculate coverage for display
  const displayCoverage = selectedFunction && functionData 
    ? functionData.coveragePercentage 
    : fileData?.coveragePercentage || 0;
  
  const displayCoveredLines = selectedFunction && functionData
    ? functionData.coveredLines?.length || 0
    : fileData?.coveredLines || 0;
    
  const displayTotalLines = selectedFunction && functionData
    ? Object.keys(functionData.lines || {}).length
    : fileData?.totalLines || 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {selectedFunction ? (
              <>
                <Code2 className="w-6 h-6 text-gray-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{selectedFunction}</h2>
                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                    <FileText className="w-4 h-4" />
                    {filename.split('/').pop() || filename}
                  </p>
                </div>
              </>
            ) : (
              <>
                <FileText className="w-6 h-6 text-gray-600" />
                <h2 className="text-2xl font-bold text-gray-800">{filename.split('/').pop() || filename}</h2>
              </>
            )}
          </div>
          
          {/* Button group on the right */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsDarkTheme(!isDarkTheme)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md transition-colors",
                isDarkTheme 
                  ? "bg-gray-700 hover:bg-gray-600 border border-gray-600" 
                  : "bg-gray-100 hover:bg-gray-200 border border-gray-300"
              )}
              title={isDarkTheme ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDarkTheme ? (
                <Sun className="w-4 h-4 text-yellow-500" />
              ) : (
                <Moon className="w-4 h-4 text-gray-600" />
              )}
              <span className={cn(
                "text-sm font-medium",
                isDarkTheme ? "text-gray-200" : "text-gray-700"
              )}>
                {isDarkTheme ? 'Light Theme' : 'Dark Theme'}
              </span>
            </button>
            
            {/* Syntax Only Mode Toggle */}
            <button
              onClick={() => setSyntaxOnlyMode(!syntaxOnlyMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md transition-colors border",
                syntaxOnlyMode
                  ? "bg-purple-100 hover:bg-purple-200 border-purple-300"
                  : "bg-gray-100 hover:bg-gray-200 border-gray-300"
              )}
              title={syntaxOnlyMode ? "Show coverage highlights" : "Show syntax highlighting only"}
            >
              <Code2 className={cn(
                "w-4 h-4",
                syntaxOnlyMode
                  ? "text-purple-600"
                  : "text-gray-600"
              )} />
              <span className={cn(
                "text-sm font-medium",
                syntaxOnlyMode
                  ? "text-purple-700"
                  : "text-gray-700"
              )}>
                Syntax Only
              </span>
            </button>
          </div>
        </div>
        {!selectedFunction && (
          <p className="text-sm text-gray-500 mb-2">{filename}</p>
        )}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Coverage:</span>
            <span className={cn("font-semibold", getCoverageColor(displayCoverage))}>
              {formatPercentage(displayCoverage)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Code className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">Lines:</span>
            <span className="font-semibold text-gray-800">
              {displayCoveredLines} / {displayTotalLines}
            </span>
          </div>
        </div>
        
        {/* Metrics Summary - Only show Instructions, Cycles, and IPC */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <div className="text-xs text-gray-600 mb-1">Instructions</div>
            <div className="text-lg font-semibold text-gray-800">{instructions.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <div className="text-xs text-gray-600 mb-1">Cycles</div>
            <div className="text-lg font-semibold text-gray-800">{cycles.toLocaleString()}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <div className="text-xs text-gray-600 mb-1">IPC</div>
            <div className="text-lg font-semibold text-gray-800">{ipc}</div>
          </div>
        </div>

        {/* Compact Controls Row */}
        <div className="mt-4 bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-6 flex-wrap justify-between">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Metrics Selection */}
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Show:</span>
                <div className="flex gap-3">
                {availableEvents.map(event => (
                  <label key={event} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(event)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedEvents);
                        if (e.target.checked) {
                          newSelected.add(event);
                        } else {
                          newSelected.delete(event);
                        }
                        setSelectedEvents(newSelected);
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                    />
                    <span className="text-xs text-gray-600">{event}</span>
                  </label>
                ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Performance Legend */}
        {!syntaxOnlyMode && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-900 bg-opacity-20 border border-green-700 rounded"></div>
                <span className="text-gray-600">Executed Lines</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 border rounded",
                  isDarkTheme 
                    ? "bg-red-600 bg-opacity-20 border-red-500" 
                    : "bg-red-300 bg-opacity-30 border-red-400"
                )}></div>
                <span className="text-gray-600">Not Executed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 bg-opacity-30 border border-blue-500 rounded"></div>
                <span className="text-gray-600">Linked Highlight</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-4 h-4 border rounded",
                  isDarkTheme 
                    ? "bg-gray-500 bg-opacity-20 border-gray-600" 
                    : "bg-gray-400 bg-opacity-15 border-gray-500"
                )}></div>
                <span className="text-gray-600">Non-compiled Lines</span>
              </div>
            </div>
            
            {/* Performance Hotspot with Settings */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded"></div>
                <span className="text-gray-600 text-sm">Performance Hotspot</span>
              </div>
              <div className="flex items-center gap-2">
                <select 
                  value={hotspotSettings.event}
                  onChange={(e) => setHotspotSettings({ ...hotspotSettings, event: e.target.value })}
                  className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-yellow-500 focus:border-yellow-500"
                >
                  {availableEvents.map(event => (
                    <option key={event} value={event}>{event}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-600">&gt;</span>
                <input
                  type="number"
                  value={hotspotSettings.threshold}
                  onChange={(e) => setHotspotSettings({ ...hotspotSettings, threshold: parseInt(e.target.value) || 0 })}
                  className="w-20 text-xs px-2 py-1 border border-gray-300 rounded focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main content area with resizable split */}
      <div ref={splitContainerRef} className="flex-1 flex flex-col relative overflow-hidden">
        {hasSourceCode ? (
          <>
            {/* Upper section - Source code */}
            <div 
              className={cn(
                "relative code-viewer",
                isDarkTheme ? "bg-gray-900 dark-theme" : "bg-white light-theme"
              )}
              style={{ flexBasis: `${splitPosition}%`, flexShrink: 0, overflow: 'hidden' }}
            >
              <div className="h-full overflow-auto">
                <table className="w-full font-mono text-sm">
                  {/* Header row for event types - like assembly view */}
                  {selectedEvents.size > 0 && (
                    <thead className={cn(
                      "sticky top-0 border-b",
                      isDarkTheme ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"
                    )}>
                      <tr>
                        <th className={cn(
                          "text-left px-4 py-2 text-xs font-medium",
                          isDarkTheme ? "text-gray-400" : "text-gray-600"
                        )}>Line</th>
                        <th className={cn(
                          "text-left px-4 py-2 text-xs font-medium",
                          isDarkTheme ? "text-gray-400" : "text-gray-600"
                        )}>Code</th>
                        {Array.from(selectedEvents).map(event => (
                          <th key={event} className={cn(
                            "text-center px-2 py-2 text-xs font-medium w-16 min-w-[64px]",
                            isDarkTheme ? "text-gray-400" : "text-gray-600"
                          )}>
                            {event}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {lines.map((line, index) => {
                      const lineNumber = index + 1 + lineOffset;
                      const isCovered = coveredSet.has(lineNumber);
                      const isUncovered = uncoveredSet.has(lineNumber);
                      const isHotspotLine = isHotspot(lineNumber);
                      const lineMetrics = getLineMetrics(lineNumber);
                      const hasLineInfo = isCovered || isUncovered; // Line has compilation info
                      
                      // Get highlighted code
                      const highlightedCode = Prism.highlight(
                        line || ' ', 
                        Prism.languages[getLanguage(filename)] || Prism.languages.plaintext, 
                        getLanguage(filename)
                      );
                      
                      return (
                        <tr
                          key={lineNumber}
                          onClick={() => handleCodeLineClick(lineNumber)}
                          className={cn(
                            "group cursor-pointer transition-all",
                            highlightedCodeLine === lineNumber && "code-line-highlight"
                          )}
                          style={{
                            backgroundColor: syntaxOnlyMode ? 'transparent' : (
                              highlightedCodeLine === lineNumber ? 
                              'rgba(59, 130, 246, 0.2)' : 
                              isHotspotLine ? (isDarkTheme ? 'rgba(113, 63, 18, 0.3)' : 'rgba(251, 191, 36, 0.2)') :
                              isCovered ? (isDarkTheme ? 'rgba(20, 83, 45, 0.2)' : 'rgba(34, 197, 94, 0.1)') :
                              isUncovered ? (isDarkTheme ? 'rgba(220, 38, 38, 0.2)' : 'rgba(254, 202, 202, 0.3)') :
                              !hasLineInfo ? (isDarkTheme ? 'rgba(107, 114, 128, 0.2)' : 'rgba(156, 163, 175, 0.15)') :
                              'transparent'
                            )
                          }}
                        >
                          {/* Line number */}
                          <td className={cn(
                            "px-4 py-1 text-xs",
                            isDarkTheme ? (
                              isCovered ? "text-blue-400" : "text-gray-600"
                            ) : (
                              isCovered ? "text-blue-600" : "text-gray-400"
                            )
                          )}>
                            {lineNumber}
                          </td>
                          
                          {/* Code */}
                          <td className={cn(
                            "px-4 py-1",
                            syntaxOnlyMode ? "" : (
                              isDarkTheme ? (
                                isCovered ? "text-gray-100" : "text-gray-500"
                              ) : (
                                isCovered ? "text-gray-900" : "text-gray-500"
                              )
                            )
                          )}>
                            {syntaxOnlyMode ? (
                              <pre className="m-0 p-0" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                            ) : (
                              <pre className="m-0 p-0">{line || ' '}</pre>
                            )}
                          </td>
                          
                          {/* Event columns */}
                          {Array.from(selectedEvents).map(event => (
                            <td key={event} className={cn(
                              "px-2 py-1 text-center text-xs w-16 min-w-[64px]",
                              isDarkTheme ? (
                                isCovered ? "text-gray-300" : "text-gray-600"
                              ) : (
                                isCovered ? "text-gray-700" : "text-gray-400"
                              )
                            )}>
                              {lineMetrics[event] ? lineMetrics[event].toLocaleString() : '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Splitter */}
            <div 
              className="h-2 bg-gray-700 cursor-ns-resize hover:bg-gray-600 transition-colors relative flex-shrink-0"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-0.5 bg-gray-500"></div>
            </div>
            
            {/* Lower section - Assembly code */}
            <div 
              className={cn(
                "flex-1 overflow-hidden",
                isDarkTheme ? "bg-gray-900" : "bg-white"
              )}
            >
              <AssemblyViewer
                objectFile={fileData.objectFile}
                pcData={selectedFunction && functionData ? functionData.pcData : 
                        Object.values(fileData.functions || {}).reduce((acc, func) => ({...acc, ...func.pcData}), {})}
                selectedEvents={selectedEvents}
                hotspotSettings={hotspotSettings}
                availableEvents={availableEvents}
                highlightedPc={highlightedAssemblyPc}
                highlightedLine={highlightedCodeLine}
                onPcClick={handleAssemblyLineClick}
                isDarkTheme={isDarkTheme}
                syntaxOnlyMode={syntaxOnlyMode}
              />
            </div>
          </>
        ) : (
          // Restructured no-source-code UI to match code view layout with resizable split
          <>
            {/* Upper section - No source code message and metrics */}
            <div 
              className={cn(
                "overflow-auto",
                isDarkTheme ? "bg-gray-900" : "bg-white"
              )}
              style={{ flexBasis: `${splitPosition}%`, flexShrink: 0 }}
            >
              {/* Source Code Not Available message */}
              <div className="p-6">
                <div className={cn(
                  "rounded-lg p-4 flex items-start gap-3",
                  isDarkTheme 
                    ? "bg-blue-900 bg-opacity-30 border border-blue-700"
                    : "bg-blue-100 border border-blue-300"
                )}>
                  <AlertCircle className={cn(
                    "w-5 h-5 mt-0.5",
                    isDarkTheme ? "text-blue-400" : "text-blue-600"
                  )} />
                  <div>
                    <h4 className={cn(
                      "font-semibold mb-1",
                      isDarkTheme ? "text-blue-100" : "text-blue-900"
                    )}>Source Code Not Available</h4>
                    <p className={cn(
                      "text-sm",
                      isDarkTheme ? "text-blue-200" : "text-blue-700"
                    )}>
                      While the source code is not available, performance metrics have been collected during execution.
                    </p>
                  </div>
                </div>
              </div>

              {/* Function Performance Metrics */}
              {Object.keys(fileData.functions || {}).length > 0 && !selectedFunction && (
                <div className="px-6 pb-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                      <thead className="bg-gray-800">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Function Name
                          </th>
                          {availableEvents.map(event => (
                            <th key={event} className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                              {event}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-gray-900 divide-y divide-gray-700">
                        {Object.entries(fileData.functions || {})
                          .sort((a, b) => {
                            // Sort by total impact (sum of all metrics)
                            const totalA = Object.values(a[1].totals || {}).reduce((sum: number, val: any) => sum + (val as number), 0);
                            const totalB = Object.values(b[1].totals || {}).reduce((sum: number, val: any) => sum + (val as number), 0);
                            return totalB - totalA;
                          })
                          .map(([funcName, funcData]) => {
                            return (
                              <tr key={funcName} className="hover:bg-gray-800">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                                  {funcName}
                                </td>
                                {availableEvents.map(event => (
                                  <td key={event} className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 text-right font-mono">
                                    {(funcData.totals?.[event] || 0).toLocaleString()}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Splitter */}
            <div 
              className="h-2 bg-gray-700 cursor-ns-resize hover:bg-gray-600 transition-colors relative flex-shrink-0"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-0.5 bg-gray-500"></div>
            </div>

            {/* Lower section - Assembly View */}
            <div className={cn(
              "flex-1 overflow-hidden",
              isDarkTheme ? "bg-gray-900" : "bg-white"
            )}>
              <AssemblyViewer
                objectFile={fileData.objectFile}
                pcData={selectedFunction && functionData ? functionData.pcData : 
                        Object.values(fileData.functions || {}).reduce((acc, func) => ({...acc, ...func.pcData}), {})}
                selectedEvents={selectedEvents}
                hotspotSettings={hotspotSettings}
                availableEvents={availableEvents}
                highlightedPc={highlightedAssemblyPc}
                highlightedLine={highlightedCodeLine}
                onPcClick={handleAssemblyLineClick}
                isDarkTheme={isDarkTheme}
                syntaxOnlyMode={syntaxOnlyMode}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}