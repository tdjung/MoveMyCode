'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Clock, Cpu, Search, Filter, BarChart3, GitBranch } from 'lucide-react';
import { CachegrindData, CallInfo, CallTreeNode } from '@/types/profiler';
import { cn } from '@/lib/utils';
import { CallTreeSearchEngine, debounce } from '@/lib/call-tree-search';
import { EntryPointMatcher } from '@/lib/entry-point-matcher';
import { FlowChartView } from './flow-chart-view';

interface CallTreeViewerProps {
  data: CachegrindData;
  entryPoint?: string | null;
}

export function CallTreeViewer({ data, entryPoint: initialEntryPoint }: CallTreeViewerProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'caller' | 'callee'>('tree');
  const [filterDepth, setFilterDepth] = useState(10);
  const [customDepth, setCustomDepth] = useState(1);
  const [useCustomDepth, setUseCustomDepth] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedFunction, setSelectedFunction] = useState<CallTreeNode | null>(null);
  const [entryPoint, setEntryPoint] = useState(initialEntryPoint || '');
  const [entryPointInput, setEntryPointInput] = useState(initialEntryPoint || '');
  const [searchResults, setSearchResults] = useState<Set<CallTreeNode> | null>(null);
  const [manualSearchMode, setManualSearchMode] = useState(true); // Default to manual mode for better performance
  const [showFlowChart, setShowFlowChart] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50); // Percentage for split view
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Initialize search engine and entry point matcher
  const searchEngine = useMemo(() => new CallTreeSearchEngine(), []);
  const entryPointMatcher = useMemo(() => new EntryPointMatcher(), []);
  
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
    let nodeId = 0;

    // Helper to create a basic node structure
    const createNode = (fileName: string, funcName: string, funcData: any): CallTreeNode => {
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
        totalTime: selfCycles,
        selfTime: selfCycles,
        children: [],
        calls: funcData.calls
      };
      
      return node;
    };

    // Build parent-child relationships
    const childToParentMap = new Map<string, string[]>();
    
    // First, collect all parent-child relationships
    Object.entries(data.fileCoverage).forEach(([filename, fileData]) => {
      Object.entries(fileData.functions || {}).forEach(([funcName, funcData]) => {
        const parentKey = `${filename}:${funcName}`;
        
        if (funcData.calls) {
          funcData.calls.forEach(call => {
            if (call.targetFunction) {
              // The targetFile might be specified in the call, otherwise use current file
              const targetFile = call.targetFile || filename;
              const childKey = `${targetFile}:${call.targetFunction}`;
              
              
              if (!childToParentMap.has(childKey)) {
                childToParentMap.set(childKey, []);
              }
              childToParentMap.get(childKey)!.push(parentKey);
            }
          });
        }
      });
    });

    // Find true root nodes (functions that are never called)
    const allFunctions = new Set(functionMap.keys());
    const calledFunctions = new Set(childToParentMap.keys());
    const rootFunctionKeys = Array.from(allFunctions).filter(key => !calledFunctions.has(key));
    

    // Recursively build tree from a given node
    const buildTreeFromNode = (functionKey: string, visited = new Set<string>()): CallTreeNode | null => {
      // Prevent infinite recursion
      if (visited.has(functionKey)) {
        return null;
      }
      
      visited.add(functionKey);
      
      const funcInfo = functionMap.get(functionKey);
      if (!funcInfo) {
        return null;
      }
      
      const node = createNode(funcInfo.fileName, funcInfo.funcName, funcInfo.funcData);
      
      // Add children
      if (funcInfo.funcData.calls) {
        funcInfo.funcData.calls.forEach(call => {
          if (call.targetFunction) {
            const targetFile = call.targetFile || funcInfo.fileName;
            const childKey = `${targetFile}:${call.targetFunction}`;
            
            // Try to build child from our function map
            const childNode = buildTreeFromNode(childKey, new Set(visited));
            
            if (childNode) {
              childNode.callCount = call.count || 1;
              node.children.push(childNode);
            } else {
              // Create stub for external or missing functions
              node.children.push({
                id: `stub-${nodeId++}`,
                functionName: call.targetFunction,
                fileName: targetFile,
                pcStart: '',
                pcEnd: '',
                callCount: call.count || 1,
                totalTime: 0,
                selfTime: 0,
                children: [],
                calls: undefined
              });
            }
          }
        });
      }
      
      return node;
    };

    // Build trees starting from root functions
    rootFunctionKeys.forEach(rootKey => {
      const rootTree = buildTreeFromNode(rootKey);
      // Filter out functions with 0 instructions/cycles
      if (rootTree && rootTree.selfTime > 0) {
        rootNodes.push(rootTree);
      }
    });

    // Store all nodes in nodeMap for search functionality
    const addToNodeMap = (node: CallTreeNode) => {
      const key = `${node.fileName}:${node.functionName}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, node);
      }
      node.children.forEach(child => addToNodeMap(child));
    };
    
    rootNodes.forEach(root => addToNodeMap(root));

    // Calculate total cycles/instructions using self time + inclusive events from calls
    const calculateTotalCycles = (node: CallTreeNode): number => {
      try {
        if (!node || typeof node !== 'object') return 0;
        
        let totalCycles = node.selfTime || 0;
        
        // Add inclusive cycles from all calls
        if (node.calls && Array.isArray(node.calls)) {
          for (const call of node.calls) {
            if (call.inclusiveEvents) {
              // Use Cy (cycles) first, fallback to Ir (instructions)
              const inclusiveCycles = call.inclusiveEvents.Cy || call.inclusiveEvents.Ir || 0;
              totalCycles += inclusiveCycles;
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
      if (nodeMap && nodeMap.size > 0) {
        // Calculate total cycles for each node independently
        nodeMap.forEach(node => {
          calculateTotalCycles(node);
        });
      }
    } catch (error) {
      console.error('Error updating total cycles for nodes:', error);
    }

    // Set some nodes as expanded by default
    if (rootNodes.length > 0 && expandedNodes.size === 0) {
      setExpandedNodes(new Set([rootNodes[0].id]));
    }

    return {
      callTreeData: rootNodes,
      nodeMap
    };
  }, [data]);
  
  // Build search index from ALL nodes, not just root nodes
  useEffect(() => {
    try {
      const allNodes = Array.from(nodeMap.values());
      console.log('Building search index with nodes:', allNodes.length);
      searchEngine.buildIndex(allNodes);
    } catch (error) {
      console.error('Error building search index:', error);
    }
  }, [nodeMap, searchEngine]);
  
  // Build entry point index when node map changes
  useEffect(() => {
    try {
      entryPointMatcher.buildIndex(nodeMap);
    } catch (error) {
      console.error('Error building entry point index:', error);
    }
  }, [nodeMap, entryPointMatcher]);
  
  // Set initial entry point if provided
  useEffect(() => {
    if (initialEntryPoint) {
      setEntryPoint(initialEntryPoint);
      setEntryPointInput(initialEntryPoint);
    }
  }, [initialEntryPoint]);
  
  // Handle manual entry point
  const handleManualEntryPoint = useCallback(() => {
    setEntryPoint(entryPointInput);
  }, [entryPointInput]);

  // Optimized entry point filtering
  const filteredTree = useMemo(() => {
    if (!entryPoint || !entryPoint.trim()) return callTreeData;
    
    console.log('Looking for entry point:', entryPoint);
    const entryNode = entryPointMatcher.findEntryNode(entryPoint);
    
    if (entryNode) {
      console.log('Found entry node:', entryNode.functionName);
      // Auto-expand the entry node if it has children
      if (entryNode.children.length > 0 && !expandedNodes.has(entryNode.id)) {
        setTimeout(() => {
          setExpandedNodes(prev => new Set([...prev, entryNode.id]));
        }, 100);
      }
      return [entryNode];
    }
    
    console.log('Entry node not found, returning full tree');
    return callTreeData;
  }, [entryPoint, callTreeData, entryPointMatcher]);
  
  // Handle entry point input based on mode
  useEffect(() => {
    if (!manualSearchMode) {
      const timer = setTimeout(() => {
        setEntryPoint(entryPointInput);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [entryPointInput, manualSearchMode]);

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };
  
  // Handle node selection from Flow Chart
  const handleFlowChartNodeSelect = useCallback((node: CallTreeNode) => {
    setSelectedFunction(node);
    
    // Find and expand path to the node
    const expandPathToNode = (targetNode: CallTreeNode) => {
      const path: string[] = [];
      
      const findPath = (nodes: CallTreeNode[], currentPath: string[]): boolean => {
        for (const n of nodes) {
          const newPath = [...currentPath, n.id];
          
          if (n.id === targetNode.id) {
            path.push(...currentPath); // Don't include the target node itself
            return true;
          }
          
          if (n.children && n.children.length > 0) {
            if (findPath(n.children, newPath)) {
              return true;
            }
          }
        }
        return false;
      };
      
      // Start search from filtered tree (which respects entry point)
      findPath(filteredTree, []);
      
      // Expand all nodes in the path
      if (path.length > 0) {
        setExpandedNodes(prev => {
          const newExpanded = new Set(prev);
          path.forEach(id => newExpanded.add(id));
          return newExpanded;
        });
      }
    };
    
    expandPathToNode(node);
  }, [filteredTree]);

  const maxTime = useMemo(() => {
    return Math.max(...callTreeData.map(n => n.selfTime), 1);
  }, [callTreeData]);

  const getHotspotColor = (selfTime: number, maxTime: number) => {
    // Return no background color - just border
    return 'bg-white border-gray-200';
  };

  // Manual search function
  const performSearch = useCallback((term: string) => {
    try {
      if (!term || term.trim() === '') {
        setSearchResults(null);
        return;
      }
      
      console.log('Searching for:', term);
      const results = searchEngine.search(term);
      console.log('Search results:', results.size);
      setSearchResults(results);
      
      // Auto-expand nodes to show search results
      if (results.size > 0 && results.size < 50) { // Limit expansion for performance
        const ancestorsToExpand = searchEngine.getAncestorsToExpand(results, Array.from(nodeMap.values()));
        setExpandedNodes(prev => {
          const newExpanded = new Set(prev);
          ancestorsToExpand.forEach(id => newExpanded.add(id));
          return newExpanded;
        });
      }
    } catch (error) {
      console.error('Error during search:', error);
      setSearchResults(null);
    }
  }, [searchEngine, nodeMap]);

  // Debounced search for auto mode
  const debouncedSearch = useMemo(
    () => debounce((term: string) => performSearch(term), 300),
    [performSearch]
  );
  
  // Handle search based on mode
  useEffect(() => {
    if (!manualSearchMode) {
      setSearchTerm(searchInput);
      debouncedSearch(searchInput);
    }
  }, [searchInput, debouncedSearch, manualSearchMode]);
  
  // Handle manual search
  const handleManualSearch = useCallback(() => {
    setSearchTerm(searchInput);
    performSearch(searchInput);
  }, [searchInput, performSearch]);
  
  // Check if node matches search results
  const nodeMatchesSearch = useCallback((node: CallTreeNode): boolean => {
    if (!searchResults) return true;
    return searchResults.has(node);
  }, [searchResults]);

  // Helper function to check if a node or any of its descendants match the search
  const nodeOrDescendantsMatch = useCallback((node: CallTreeNode, visited = new Set<string>()): boolean => {
    if (visited.has(node.id)) return false;
    visited.add(node.id);
    
    if (!searchResults || searchResults.size === 0) return true;
    if (searchResults.has(node)) return true;
    
    if (node.children && Array.isArray(node.children)) {
      return node.children.some(child => nodeOrDescendantsMatch(child, visited));
    }
    return false;
  }, [searchResults]);

  const TreeNode = ({ node, depth = 0, maxDepth = filterDepth }: { 
    node: CallTreeNode; 
    depth?: number; 
    maxDepth?: number 
  }) => {
    if (depth > maxDepth) return null;
    
    // Check if this node or any of its descendants match the search
    if (!nodeOrDescendantsMatch(node)) return null;
    
    const nodeMatches = nodeMatchesSearch(node);
    const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
    // Keep node expanded if it's in expanded set
    const isExpanded = expandedNodes.has(node.id);
    
    const handleToggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Save current scroll position
      const scrollContainer = e.currentTarget.closest('.overflow-y-auto');
      const scrollTop = scrollContainer?.scrollTop || 0;
      
      toggleExpand(node.id);
      
      // Restore scroll position after React updates
      if (scrollContainer) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollTop;
        });
      }
    };

    return (
      <div className="select-none">
        <div 
          className={cn(
            "flex items-center p-2 hover:bg-gray-50 cursor-pointer border rounded-lg mb-1",
            selectedFunction?.id === node.id ? 'border-blue-500 border-2' : 'border-gray-200',
            nodeMatches && searchResults && searchResults.size > 0 ? 'bg-yellow-50' : ''
          )}
          style={{ marginLeft: `${depth * 20}px` }}
          onClick={() => setSelectedFunction(node)}
        >
          <div className="flex items-center flex-1">
            {hasChildren && (
              <button 
                onClick={handleToggleExpand}
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
                  self: {node.selfTime.toLocaleString()} {metricName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  incl: {node.totalTime.toLocaleString()} {metricName}
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

  // Handle split view resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !splitContainerRef.current) return;
    
    const container = splitContainerRef.current;
    const rect = container.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = (y / rect.height) * 100;
    
    // Limit split position between 20% and 80%
    setSplitPosition(Math.min(80, Math.max(20, percentage)));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

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
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualSearchMode) {
                  handleManualSearch();
                }
              }}
              className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {manualSearchMode && (
              <button
                onClick={handleManualSearch}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Search
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Entry Point:</span>
            <input
              type="text"
              placeholder="e.g., main or 0x8000"
              value={entryPointInput}
              onChange={(e) => setEntryPointInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualSearchMode) {
                  handleManualEntryPoint();
                }
              }}
              className="px-3 py-1 border rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
            {manualSearchMode && (
              <button
                onClick={handleManualEntryPoint}
                className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Set
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!manualSearchMode}
                onChange={(e) => setManualSearchMode(!e.target.checked)}
                className="rounded"
              />
              <span>Real-time search</span>
            </label>
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

          <div className="flex gap-4">
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
            
            <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border">
              <input
                type="checkbox"
                checked={showFlowChart}
                onChange={(e) => setShowFlowChart(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Show Flow Chart</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {showFlowChart ? (
          <div ref={splitContainerRef} className="h-full flex flex-col">
            {/* Top section - Tree View */}
            <div style={{ height: `${splitPosition}%` }} className="overflow-hidden">
              <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
                {/* Main View */}
                <div className="lg:col-span-2 overflow-y-auto">
                  {viewMode === 'tree' && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Function Call Tree</h3>
                      <div className="border rounded-lg p-4 bg-white">
                        {filteredTree.length === 0 ? (
                          <div className="text-center py-8">
                            <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 mb-2">
                              {entryPoint 
                                ? `No function found for entry point "${entryPoint}"`
                                : "No call tree data available"}
                            </p>
                            <p className="text-sm text-gray-400">
                              {entryPoint
                                ? "Try a different entry point or clear the filter"
                                : "Make sure your profiling data includes call information (cfi, cfn, calls)"}
                            </p>
                          </div>
                        ) : (
                          (() => {
                            if (searchResults && searchResults.size === 0 && searchTerm) {
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
                            
                            return filteredTree.map(node => (
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
                      <div><span className="font-medium">Root Functions:</span> {filteredTree.length}</div>
                      <div><span className="font-medium">Total Functions:</span> {nodeMap.size}</div>
                      <div><span className="font-medium">Total {metricNameCapitalized}:</span> {(data.summaryTotals?.Cy || data.summaryTotals?.Ir || 0).toLocaleString()}</div>
                      <div><span className="font-medium">Total Calls:</span> {Array.from(nodeMap.values()).reduce((sum, n) => sum + (n.calls?.length || 0), 0)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Resize handle */}
            <div 
              className="h-1 bg-gray-300 hover:bg-gray-400 cursor-row-resize transition-colors"
              onMouseDown={handleMouseDown}
            />
            
            {/* Bottom section - Flow Chart */}
            <div style={{ height: `${100 - splitPosition}%` }} className="overflow-hidden">
              <FlowChartView 
                selectedNode={selectedFunction}
                allNodes={filteredTree}
                onNodeSelect={handleFlowChartNodeSelect}
              />
            </div>
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            {/* Main View */}
            <div className="lg:col-span-2 overflow-y-auto">
              {viewMode === 'tree' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Function Call Tree</h3>
                  <div className="border rounded-lg p-4 bg-white">
                    {filteredTree.length === 0 ? (
                      <div className="text-center py-8">
                        <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 mb-2">
                          {entryPoint 
                            ? `No function found for entry point "${entryPoint}"`
                            : "No call tree data available"}
                        </p>
                        <p className="text-sm text-gray-400">
                          {entryPoint
                            ? "Try a different entry point or clear the filter"
                            : "Make sure your profiling data includes call information (cfi, cfn, calls)"}
                        </p>
                      </div>
                    ) : (
                      (() => {
                        if (searchResults && searchResults.size === 0 && searchTerm) {
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
                        
                        return filteredTree.map(node => (
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
                  <div><span className="font-medium">Root Functions:</span> {filteredTree.length}</div>
                  <div><span className="font-medium">Total Functions:</span> {nodeMap.size}</div>
                  <div><span className="font-medium">Total {metricNameCapitalized}:</span> {(data.summaryTotals?.Cy || data.summaryTotals?.Ir || 0).toLocaleString()}</div>
                  <div><span className="font-medium">Total Calls:</span> {Array.from(nodeMap.values()).reduce((sum, n) => sum + (n.calls?.length || 0), 0)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}