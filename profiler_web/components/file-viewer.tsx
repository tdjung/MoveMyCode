'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Code, Activity, Cpu, Zap, GitBranch, AlertCircle, Settings, Eye, Code2 } from 'lucide-react';
import { FileCoverage, FunctionData } from '@/types/profiler';
import { formatPercentage, getCoverageColor, cn } from '@/lib/utils';
import Prism from 'prismjs';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';

// Custom CSS for code display
const codeStyles = `
  .code-viewer table {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  }
  .code-viewer td {
    padding-top: 0;
    padding-bottom: 0;
    line-height: 1.5;
  }
  .code-viewer pre {
    margin: 0;
    padding: 0;
    background: transparent;
  }
  .code-viewer code {
    background: transparent;
  }
  
  /* Custom syntax highlighting with stronger colors */
  .token.comment,
  .token.prolog,
  .token.doctype,
  .token.cdata {
    color: #008000;
    font-style: italic;
  }
  
  .token.punctuation {
    color: #333333;
  }
  
  .token.property,
  .token.tag,
  .token.boolean,
  .token.number,
  .token.constant,
  .token.symbol,
  .token.deleted {
    color: #0000ff;
    font-weight: 600;
  }
  
  .token.selector,
  .token.attr-name,
  .token.string,
  .token.char,
  .token.builtin,
  .token.inserted {
    color: #a31515;
  }
  
  .token.operator,
  .token.entity,
  .token.url,
  .language-css .token.string,
  .style .token.string {
    color: #333333;
    font-weight: 600;
  }
  
  .token.atrule,
  .token.attr-value,
  .token.keyword {
    color: #0000ff;
    font-weight: 600;
  }
  
  .token.function,
  .token.class-name {
    color: #795da3;
    font-weight: 600;
  }
  
  .token.regex,
  .token.important,
  .token.variable {
    color: #ee9900;
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
  const functionLineNumbers = functionData ? Object.keys(functionData.lines).map(Number).sort((a, b) => a - b) : [];
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
      const lineData = functionData.lines[lineNumber];
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
    ? Object.keys(functionData.lines).length
    : fileData?.totalLines || 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          {selectedFunction ? (
            <>
              <Code2 className="w-6 h-6 text-gray-600" />
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{selectedFunction}</h2>
                <p className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                  <FileText className="w-4 h-4" />
                  {filename}
                </p>
              </div>
            </>
          ) : (
            <>
              <FileText className="w-6 h-6 text-gray-600" />
              <h2 className="text-2xl font-bold text-gray-800">{filename}</h2>
            </>
          )}
        </div>
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

            {/* Hotspot Settings */}
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">Hotspot:</span>
              <select
                value={hotspotSettings.event}
                onChange={(e) => setHotspotSettings({ ...hotspotSettings, event: e.target.value })}
                className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-yellow-500 focus:border-yellow-500"
              >
                {availableEvents.map(event => (
                  <option key={event} value={event}>{event}</option>
                ))}
              </select>
              <span className="text-xs text-gray-600">></span>
              <input
                type="number"
                value={hotspotSettings.threshold}
                onChange={(e) => setHotspotSettings({ ...hotspotSettings, threshold: parseInt(e.target.value) || 0 })}
                className="w-20 text-xs px-2 py-1 border border-gray-300 rounded focus:ring-yellow-500 focus:border-yellow-500"
              />
            </div>
          </div>
        </div>

        {/* Performance Legend */}
        <div className="mt-4 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">Executed Lines</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-600">Not Executed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span className="text-gray-600">Performance Hotspot (>{hotspotSettings.threshold.toLocaleString()} {hotspotSettings.event})</span>
          </div>
        </div>
      </div>

      {/* Main content area with resizable split */}
      <div ref={splitContainerRef} className="flex-1 flex flex-col relative overflow-hidden">
        {hasSourceCode ? (
          <>
            {/* Upper section - Source code */}
            <div 
              className="relative code-viewer bg-gray-50"
              style={{ flexBasis: `${splitPosition}%`, flexShrink: 0, overflow: 'hidden' }}
            >
              <div className="h-full overflow-auto">
                <table className="w-full border-collapse bg-white">
                  {/* Header row for event types */}
                  {selectedEvents.size > 0 && (
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="sticky left-0 bg-gray-100 text-center px-3 text-xs font-medium text-gray-600 border-r border-gray-200">Line</th>
                        <th className="bg-gray-100 text-left px-4 text-xs font-medium text-gray-600">Code</th>
                        {Array.from(selectedEvents).map(event => (
                          <th key={event} className="bg-gray-100 text-center px-2 text-xs font-medium text-gray-600 border-l border-gray-200 min-w-[60px]">
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
                      
                      // Get highlighted code
                      const highlightedCode = Prism.highlight(
                        line || ' ', 
                        Prism.languages[getLanguage(filename)] || Prism.languages.plaintext, 
                        getLanguage(filename)
                      );
                      
                      return (
                        <tr
                          key={lineNumber}
                          className={cn(
                            "group",
                            isHotspotLine && "bg-yellow-50",
                            isCovered && !isHotspotLine && "bg-green-50",
                            isUncovered && !isHotspotLine && "bg-red-50"
                          )}
                        >
                          {/* Line number */}
                          <td className="sticky left-0 bg-gray-50 text-right pr-3 pl-6 text-gray-500 select-none w-20 align-top text-sm font-mono border-r border-gray-200">
                            {lineNumber}
                          </td>
                          
                          {/* Code */}
                          <td className={cn(
                            "pl-4 pr-6 align-top",
                            isHotspotLine && "bg-yellow-50",
                            isCovered && !isHotspotLine && "bg-green-50",
                            isUncovered && !isHotspotLine && "bg-red-50",
                            !isHotspotLine && !isCovered && !isUncovered && "bg-white"
                          )}>
                            <pre className="m-0 p-0 text-sm font-mono leading-relaxed">
                              <code 
                                className={`language-${getLanguage(filename)}`}
                                dangerouslySetInnerHTML={{ __html: highlightedCode }}
                              />
                            </pre>
                          </td>
                          
                          {/* Metrics - now on the right */}
                          {Array.from(selectedEvents).map(event => (
                            <td key={event} className="px-2 text-center text-xs text-gray-600 align-top font-mono bg-gray-50 border-l border-gray-200">
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
              className="h-2 bg-gray-300 cursor-ns-resize hover:bg-gray-400 transition-colors relative flex-shrink-0"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 h-0.5 bg-gray-500"></div>
            </div>
            
            {/* Lower section - Assembly code */}
            <div 
              className="flex-1 bg-gray-100 overflow-hidden"
            >
              <div className="h-full overflow-auto">
                <div className="p-6 text-center text-gray-500">
                  <div className="text-lg font-medium mb-2">Assembly View</div>
                  <div className="text-sm">Machine code will be displayed here</div>
                </div>
              </div>
            </div>
          </>
        ) : (
          // Restructured no-source-code UI to match code view layout
          <div className="h-full flex flex-col">
            {/* Source Code Not Available message */}
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Source Code Not Available</h4>
                  <p className="text-blue-800 text-sm">
                    While the source code is not available, performance metrics have been collected during execution.
                  </p>
                </div>
              </div>
            </div>

            {/* Function Performance Metrics */}
            {Object.keys(fileData.functions || {}).length > 0 && !selectedFunction && (
              <div className="px-6 pb-6 overflow-auto">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Function Name
                        </th>
                        {availableEvents.map(event => (
                          <th key={event} className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {event}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(fileData.functions || {})
                        .sort((a, b) => {
                          // Sort by total impact (sum of all metrics)
                          const totalA = Object.values(a[1].totals || {}).reduce((sum, val) => sum + val, 0);
                          const totalB = Object.values(b[1].totals || {}).reduce((sum, val) => sum + val, 0);
                          return totalB - totalA;
                        })
                        .map(([funcName, funcData]) => {
                          return (
                            <tr key={funcName} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {funcName}
                              </td>
                              {availableEvents.map(event => (
                                <td key={event} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                                  {(funcData.totals[event] || 0).toLocaleString()}
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

            {/* Assembly View - Always shown */}
            <div className="border-t-2 border-gray-300 bg-gray-100 h-48">
              <div className="h-full p-6 flex items-center justify-center text-gray-500">
                <div>
                  <div className="text-lg font-medium mb-2">Assembly View</div>
                  <div className="text-sm">Machine code will be displayed here</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}