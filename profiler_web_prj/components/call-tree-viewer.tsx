'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, Cpu, Search, Filter, BarChart3, GitBranch } from 'lucide-react';
import { CachegrindData, CallInfo } from '@/types/profiler';
import { cn } from '@/lib/utils';

interface CallTreeNode {
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

interface CallTreeViewerProps {
  data: CachegrindData;
}

export function CallTreeViewer({ data }: CallTreeViewerProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'caller' | 'callee'>('tree');
  const [filterDepth, setFilterDepth] = useState(10);
  const [customDepth, setCustomDepth] = useState(1);
  const [useCustomDepth, setUseCustomDepth] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedFunction, setSelectedFunction] = useState<CallTreeNode | null>(null);
  const [entryPoint, setEntryPoint] = useState('');
  
  // Check if we have cycles data or need to use instructions
  const hasCycles = data.summaryTotals?.Cy !== undefined;
  const metricName = hasCycles ? 'cycles' : 'instructions';
  const metricNameCapitalized = hasCycles ? 'Cycles' : 'Instructions';

  // Convert CachegrindData to CallTree structure
  const { callTreeData, nodeMap } = useMemo(() => {
    // Build a map of all functions
    const functionMap = new Map<string, {
      fileName: string;
      funcName: string;
      funcData: any;
    }>();
    
    // Build function map
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        const key = `${filename}:${funcName}`;
        functionMap.set(key, { fileName: filename, funcName, funcData });
      });
    });

    // Build call tree
    const nodeMap = new Map<string, CallTreeNode>();
    const rootNodes: CallTreeNode[] = [];
    const processedFunctions = new Set<string>();
    let nodeId = 0;

    // Helper to create a node
    const createNode = (fileName: string, funcName: string, funcData: any): CallTreeNode => {
      const key = `${fileName}:${funcName}`;
      if (nodeMap.has(key)) {
        return nodeMap.get(key)!;
      }

      const pcAddresses = Object.keys(funcData.pcData || {});
      
      // Use Cy (cycles) first, fallback to Ir (instructions)
      const selfCycles = funcData.totals?.Cy || funcData.totals?.Ir || 0;
      
      const node: CallTreeNode = {
        id: `node-${nodeId++}`,
        functionName: funcName,
        fileName: fileName,
        pcStart: pcAddresses[0] || '',
        pcEnd: pcAddresses[pcAddresses.length - 1] || '',
        callCount: 1,
        totalTime: selfCycles, // Will be updated with sub-call cycles
        selfTime: selfCycles,
        children: [],
        calls: funcData.calls
      };
      
      nodeMap.set(key, node);
      return node;
    };

    // Build tree starting from functions that are not called by others
    const calledFunctions = new Set<string>();
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        if (funcData.calls) {
          funcData.calls.forEach(call => {
            if (call.targetFunction) {
              const targetFile = call.targetFile || filename;
              calledFunctions.add(`${targetFile}:${call.targetFunction}`);
            }
          });
        }
      });
    });

    // Process all functions
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        const key = `${filename}:${funcName}`;
        const node = createNode(filename, funcName, funcData);
        
        // If this function is not called by others, it's a root
        if (!calledFunctions.has(key)) {
          rootNodes.push(node);
        }
        
        // Add children based on calls
        if (funcData.calls) {
          funcData.calls.forEach(call => {
            if (call.targetFunction) {
              const targetFile = call.targetFile || filename;
              const targetKey = `${targetFile}:${call.targetFunction}`;
              const targetInfo = functionMap.get(targetKey);
              
              if (targetInfo) {
                const childNode = createNode(targetInfo.fileName, targetInfo.funcName, targetInfo.funcData);
                // Update call count based on how many times this function is called
                childNode.callCount = call.count || 1;
                if (!node.children.some(child => child && child.id === childNode.id)) {
                  node.children.push(childNode);
                }
              } else {
                // Create a stub node for external functions
                const stubNode: CallTreeNode = {
                  id: `node-${nodeId++}`,
                  functionName: call.targetFunction || 'unknown',
                  fileName: targetFile,
                  pcStart: '',
                  pcEnd: '',
                  callCount: call.count || 1,
                  totalTime: 0,
                  selfTime: 0,
                  children: [],
                  calls: undefined
                };
                node.children.push(stubNode);
              }
            }
          });
        }
      });
    });

    // Calculate total cycles/instructions (including sub-calls) recursively
    const calculateTotalCycles = (node: CallTreeNode): number => {
      try {
        if (!node || typeof node !== 'object') return 0;
        
        let totalCycles = node.selfTime || 0;
        
        // Add cycles from all child calls
        if (node.children && Array.isArray(node.children) && node.children.length > 0) {
          for (const child of node.children) {
            if (child && typeof child === 'object') {
              // Use the call count to multiply child's total cycles
              const childTotalCycles = calculateTotalCycles(child);
              const callCount = child.callCount || 1;
              totalCycles += childTotalCycles * callCount;
            }
          }
        }
        
        node.totalTime = totalCycles;
        return totalCycles;
      } catch (error) {
        console.error('Error calculating total cycles:', error);
        return node?.selfTime || 0;
      }
    };

    // Update total cycles for all nodes
    try {
      if (rootNodes && Array.isArray(rootNodes)) {
        rootNodes.forEach(node => {
          if (node) {
            calculateTotalCycles(node);
          }
        });
      }
    } catch (error) {
      console.error('Error updating total cycles for nodes:', error);
    }

    // If we have an entry point specified, filter to show only that subtree
    if (entryPoint) {
      const trimmedEntry = entryPoint.trim().toLowerCase();
      const entryNode = Array.from(nodeMap.values()).find(node => {
        // Match by function name (case-insensitive)
        if (node.functionName.toLowerCase() === trimmedEntry) return true;
        
        // Match by exact PC start
        if (node.pcStart === entryPoint.trim()) return true;
        
        // Match if entry point is within the PC range
        if (node.pcStart && node.pcEnd && entryPoint.trim().startsWith('0x')) {
          const entryAddr = parseInt(entryPoint.trim(), 16);
          const startAddr = parseInt(node.pcStart, 16);
          const endAddr = parseInt(node.pcEnd, 16);
          if (!isNaN(entryAddr) && !isNaN(startAddr) && !isNaN(endAddr)) {
            return entryAddr >= startAddr && entryAddr <= endAddr;
          }
        }
        
        return false;
      });
      
      if (entryNode) {
        // Auto-expand the entry node if it has children
        if (entryNode.children.length > 0 && !expandedNodes.has(entryNode.id)) {
          setExpandedNodes(new Set([entryNode.id]));
        }
        return {
          callTreeData: [entryNode],
          nodeMap
        };
      }
    }

    // Set some nodes as expanded by default
    if (rootNodes.length > 0 && expandedNodes.size === 0) {
      setExpandedNodes(new Set([rootNodes[0].id]));
    }

    return {
      callTreeData: rootNodes.length > 0 ? rootNodes : Array.from(nodeMap.values()),
      nodeMap
    };
  }, [data, entryPoint]);

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const maxTime = useMemo(() => {
    return Math.max(...callTreeData.map(n => n.selfTime), 1);
  }, [callTreeData]);

  const getHotspotColor = (selfTime: number, maxTime: number) => {
    // Return no background color - just border
    return 'bg-white border-gray-200';
  };

  // Check if node or any of its descendants match the search term
  const nodeMatchesSearch = (node: CallTreeNode, term: string): boolean => {
    if (!term || term.trim() === '') return true;
    if (!node) return false;
    
    try {
      const lowerTerm = term.toLowerCase();
      if (node.functionName && typeof node.functionName === 'string' && 
          node.functionName.toLowerCase().includes(lowerTerm)) {
        return true;
      }
      
      // Check if any child matches - with additional safety checks
      if (node.children && Array.isArray(node.children) && node.children.length > 0) {
        return node.children.some(child => {
          if (!child || typeof child !== 'object') return false;
          try {
            return nodeMatchesSearch(child, term);
          } catch (error) {
            console.warn('Error checking child node:', error);
            return false;
          }
        });
      }
      
      return false;
    } catch (error) {
      console.warn('Error in nodeMatchesSearch:', error);
      return false;
    }
  };

  const TreeNode = ({ node, depth = 0, maxDepth = filterDepth }: { 
    node: CallTreeNode; 
    depth?: number; 
    maxDepth?: number 
  }) => {
    if (depth > maxDepth) return null;
    
    const nodeMatches = nodeMatchesSearch(node, searchTerm);
    if (!nodeMatches) return null;
    
    const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
    // Auto-expand when searching and node has matching children
    const isExpanded = expandedNodes.has(node.id) || (searchTerm && hasChildren && node.children.some(child => child && nodeMatchesSearch(child, searchTerm)));

    return (
      <div className="select-none">
        <div 
          className={cn(
            "flex items-center p-2 hover:bg-gray-50 cursor-pointer border rounded-lg mb-1",
            selectedFunction?.id === node.id ? 'border-blue-500 border-2' : 'border-gray-200'
          )}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => setSelectedFunction(node)}
        >
          <div className="flex items-center flex-1">
            {hasChildren && (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                className="mr-2 p-1 hover:bg-gray-200 rounded"
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            {!hasChildren && <div className="w-6" />}
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{node.functionName}</span>
                {node.fileName && (
                  <span className="text-xs text-gray-400">
                    ({node.fileName.split('/').pop() || node.fileName})
                  </span>
                )}
                {node.pcStart && (
                  <span className="text-xs text-gray-500 font-mono">
                    {node.pcStart} - {node.pcEnd}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {node.selfTime.toLocaleString()} {metricName}
                </span>
                <span className="flex items-center gap-1">
                  <Cpu size={12} />
                  {node.callCount} {node.callCount === 1 ? 'call' : 'calls'}
                </span>
                {hasChildren && (
                  <span className="text-xs text-gray-500">
                    → calls {node.children.length} {node.children.length === 1 ? 'function' : 'functions'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {isExpanded && hasChildren && node.children && (
          <div>
            {node.children.map(child => (
              <TreeNode 
                key={child.id} 
                node={child} 
                depth={depth + 1} 
                maxDepth={maxDepth}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const CallerView = () => {
    if (!selectedFunction) {
      return (
        <div className="text-center py-8">
          <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Select a function to view its callers</p>
          <p className="text-sm text-gray-400">
            Functions that call the selected function will appear here
          </p>
        </div>
      );
    }

    // Find all functions that call the selected function
    const callers: CallTreeNode[] = [];
    const selectedKey = `${selectedFunction.fileName}:${selectedFunction.functionName}`;
    
    Array.from(nodeMap.values()).forEach(node => {
      if (node.calls) {
        node.calls.forEach(call => {
          const targetKey = `${call.targetFile || node.fileName}:${call.targetFunction}`;
          if (targetKey === selectedKey) {
            callers.push({
              ...node,
              callCount: call.count
            });
          }
        });
      }
    });

    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold mb-4">
          Functions calling {selectedFunction.functionName}
        </h3>
        {callers.length === 0 ? (
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-600 text-center">
              No callers found for {selectedFunction.functionName}
            </p>
          </div>
        ) : (
          callers.map((caller, index) => (
            <div key={`${caller.id}-${index}`} className="flex items-center p-3 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 cursor-pointer"
                 onClick={() => setSelectedFunction(caller)}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{caller.functionName}</span>
                  <span className="text-xs text-gray-400">
                    ({caller.fileName.split('/').pop() || caller.fileName})
                  </span>
                  {caller.pcStart && (
                    <span className="text-xs text-gray-500 font-mono">
                      {caller.pcStart} - {caller.pcEnd}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Calls: {caller.callCount} times | Self {metricName}: {caller.selfTime.toLocaleString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const CalleeView = () => {
    if (!selectedFunction) {
      return (
        <div className="text-center py-8">
          <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">Select a function to view its callees</p>
          <p className="text-sm text-gray-400">
            Functions called by the selected function will appear here
          </p>
        </div>
      );
    }

    // Get direct callees from the selected function
    const callees = selectedFunction.children || [];

    return (
      <div className="space-y-2">
        <h3 className="text-lg font-semibold mb-4">
          Functions called by {selectedFunction.functionName}
        </h3>
        {callees.length === 0 ? (
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-gray-600 text-center">
              No callees found for {selectedFunction.functionName}
            </p>
          </div>
        ) : (
          callees.map((callee, index) => (
            <div key={`${callee.id}-${index}`} className="flex items-center p-3 bg-green-50 rounded-lg border border-green-200 hover:bg-green-100 cursor-pointer"
                 onClick={() => setSelectedFunction(callee)}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{callee.functionName}</span>
                  <span className="text-xs text-gray-400">
                    ({callee.fileName.split('/').pop() || callee.fileName})
                  </span>
                  {callee.pcStart && (
                    <span className="text-xs text-gray-500 font-mono">
                      {callee.pcStart} - {callee.pcEnd}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Calls: {callee.callCount} times | Self {metricName}: {callee.selfTime.toLocaleString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-2">
          <GitBranch className="w-6 h-6 text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-900">Call Tree Analysis</h1>
        </div>
        <p className="text-gray-600">Function call relationship visualization based on PC tracking</p>
      </div>

      {/* Control Panel */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-gray-500" />
            <input
              type="text"
              placeholder="Search function..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Entry Point:</span>
            <input
              type="text"
              placeholder="e.g., main or 0x8000"
              value={entryPoint}
              onChange={(e) => setEntryPoint(e.target.value)}
              className="px-3 py-1 border rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <label className="text-sm text-gray-600">Depth limit:</label>
            <select 
              value={useCustomDepth ? 'custom' : filterDepth} 
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'custom') {
                  setUseCustomDepth(true);
                  setFilterDepth(customDepth);
                } else {
                  setUseCustomDepth(false);
                  setFilterDepth(Number(value));
                }
              }}
              className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={3}>3 levels</option>
              <option value={5}>5 levels</option>
              <option value={10}>10 levels</option>
              <option value={999}>All</option>
              <option value="custom">Custom</option>
            </select>
            {useCustomDepth && (
              <input
                type="number"
                min="1"
                value={customDepth}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  setCustomDepth(value);
                  setFilterDepth(value);
                }}
                placeholder="1"
                className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-16 text-sm"
              />
            )}
          </div>

          <div className="flex bg-white rounded-lg border">
            <button
              onClick={() => setViewMode('tree')}
              className={cn(
                "px-4 py-2 text-sm rounded-l-lg",
                viewMode === 'tree' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              Tree View
            </button>
            <button
              onClick={() => setViewMode('caller')}
              className={cn(
                "px-4 py-2 text-sm",
                viewMode === 'caller' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              Callers
            </button>
            <button
              onClick={() => setViewMode('callee')}
              className={cn(
                "px-4 py-2 text-sm rounded-r-lg",
                viewMode === 'callee' ? 'bg-blue-500 text-white' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              Callees
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Main View */}
          <div className="lg:col-span-2 overflow-y-auto">
            {viewMode === 'tree' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Function Call Tree</h3>
                <div className="border rounded-lg p-4 bg-white">
                  {callTreeData.length === 0 ? (
                    <div className="text-center py-8">
                      <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-2">No call tree data available</p>
                      <p className="text-sm text-gray-400">
                        Make sure your profiling data includes call information (cfi, cfn, calls)
                      </p>
                    </div>
                  ) : (
                    (() => {
                      const filteredNodes = callTreeData.filter(node => nodeMatchesSearch(node, searchTerm));
                      
                      if (searchTerm && filteredNodes.length === 0) {
                        return (
                          <div className="text-center py-8">
                            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 mb-2">No functions match "{searchTerm}"</p>
                            <p className="text-sm text-gray-400">
                              Try a different search term or clear the search
                            </p>
                          </div>
                        );
                      }
                      
                      return filteredNodes.map(node => (
                        <TreeNode key={node.id} node={node} />
                      ));
                    })()
                  )}
                </div>
              </div>
            )}
            
            {viewMode === 'caller' && <CallerView />}
            {viewMode === 'callee' && <CalleeView />}
          </div>

          {/* Side Panel */}
          <div className="space-y-4 overflow-y-auto">
            {selectedFunction && (
              <div className="border rounded-lg p-4 bg-blue-50">
                <h4 className="font-semibold text-blue-900 mb-3">Function Details</h4>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Function:</span> {selectedFunction.functionName}</div>
                  <div><span className="font-medium">PC Range:</span> {selectedFunction.pcStart} - {selectedFunction.pcEnd}</div>
                  <div><span className="font-medium">Total {metricNameCapitalized}:</span> {selectedFunction.totalTime.toLocaleString()} {metricName}</div>
                  <div><span className="font-medium">Self {metricNameCapitalized}:</span> {selectedFunction.selfTime.toLocaleString()} {metricName}</div>
                  <div><span className="font-medium">Call Count:</span> {selectedFunction.callCount}</div>
                  <div><span className="font-medium">{metricNameCapitalized} per Call:</span> {Math.round(selectedFunction.totalTime / selectedFunction.callCount).toLocaleString()} {metricName}</div>
                </div>
              </div>
            )}

            <div className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold text-gray-900 mb-3">Summary Statistics</h4>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Root Functions:</span> {callTreeData.length}</div>
                <div><span className="font-medium">Total Functions:</span> {nodeMap.size}</div>
                <div><span className="font-medium">Total {metricNameCapitalized}:</span> {(data.summaryTotals?.Cy || data.summaryTotals?.Ir || 0).toLocaleString()}</div>
                <div><span className="font-medium">Total Calls:</span> {Array.from(nodeMap.values()).reduce((sum, n) => sum + (n.calls?.length || 0), 0)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}