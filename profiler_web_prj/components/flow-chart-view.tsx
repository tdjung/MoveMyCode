'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CallTreeNode } from '@/types/profiler';
import { cn } from '@/lib/utils';
import { GitBranch } from 'lucide-react';

interface FlowChartViewProps {
  selectedNode: CallTreeNode | null;
  allNodes: CallTreeNode[];
  onNodeSelect: (node: CallTreeNode) => void;
}

interface NodePosition {
  node: CallTreeNode;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  isPath: boolean;
}

const MIN_NODE_WIDTH = 150;
const MAX_NODE_WIDTH = 300;
const NODE_HEIGHT = 60;
const LEVEL_HEIGHT = 120;
const NODE_GAP = 30;
const NODE_PADDING = 20; // Padding for text inside node

export function FlowChartView({ selectedNode, allNodes, onNodeSelect }: FlowChartViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  
  // Calculate text width for dynamic box sizing
  const calculateTextWidth = (text: string, fontSize: number = 14): number => {
    // Approximate character width (monospace-like estimation)
    const charWidth = fontSize * 0.6;
    return text.length * charWidth;
  };
  
  // Calculate node width based on content
  const calculateNodeWidth = (node: CallTreeNode): number => {
    const nameWidth = calculateTextWidth(node.functionName);
    const infoText = `${node.selfTime.toLocaleString()} cycles${node.children && node.children.length > 0 ? `, ${node.children.length} call${node.children.length === 1 ? '' : 's'}` : ''}`;
    const infoWidth = calculateTextWidth(infoText, 12);
    
    const requiredWidth = Math.max(nameWidth, infoWidth) + NODE_PADDING * 2;
    return Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, requiredWidth));
  };
  
  // Find the path to the selected node
  const findPathToNode = (targetNode: CallTreeNode | null): CallTreeNode[] => {
    if (!targetNode) return [];
    
    const path: CallTreeNode[] = [];
    const visited = new Set<string>();
    
    const findPath = (nodes: CallTreeNode[], currentPath: CallTreeNode[]): boolean => {
      for (const node of nodes) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        
        const newPath = [...currentPath, node];
        
        if (node.id === targetNode.id) {
          path.push(...newPath);
          return true;
        }
        
        if (node.children && node.children.length > 0) {
          if (findPath(node.children, newPath)) {
            return true;
          }
        }
      }
      return false;
    };
    
    findPath(allNodes, []);
    return path;
  };
  
  // Calculate positions for nodes
  useEffect(() => {
    const calculatePositions = () => {
      const positions: NodePosition[] = [];
      const levelWidths: Map<number, number> = new Map();
      const parentPositions: Map<string, NodePosition> = new Map();
      const path = findPathToNode(selectedNode);
      const pathIds = new Set(path.map(n => n.id));
      
      // Get nodes to display
      let nodesToDisplay: { node: CallTreeNode; level: number; parent?: CallTreeNode }[] = [];
      const visited = new Set<string>();
      
      if (!selectedNode && allNodes.length > 0) {
        // Show first 3 levels from root
        const addNodes = (nodes: CallTreeNode[], level: number, parent?: CallTreeNode) => {
          if (level > 3) return;
          
          for (const node of nodes) {
            if (!visited.has(node.id)) {
              visited.add(node.id);
              nodesToDisplay.push({ node, level, parent });
              
              if (node.children && node.children.length > 0) {
                addNodes(node.children, level + 1, node);
              }
            }
          }
        };
        
        addNodes(allNodes, 1);
      } else if (selectedNode) {
        // Show selected node + 3 levels up and down
        const selectedIndex = path.findIndex(n => n.id === selectedNode.id);
        
        if (selectedIndex !== -1) {
          // Add ancestors
          const startIndex = Math.max(0, selectedIndex - 3);
          for (let i = startIndex; i < path.length; i++) {
            const node = path[i];
            const parent = i > 0 ? path[i - 1] : undefined;
            if (!visited.has(node.id)) {
              visited.add(node.id);
              nodesToDisplay.push({ node, level: i - startIndex + 1, parent });
            }
          }
          
          // Add descendants
          const addDescendants = (node: CallTreeNode, currentLevel: number, maxLevel: number, parent: CallTreeNode) => {
            if (currentLevel > maxLevel) return;
            
            if (node.children && node.children.length > 0) {
              for (const child of node.children) {
                if (!visited.has(child.id)) {
                  visited.add(child.id);
                  nodesToDisplay.push({ node: child, level: currentLevel, parent: node });
                  
                  if (pathIds.has(child.id) || currentLevel < maxLevel) {
                    addDescendants(child, currentLevel + 1, maxLevel, child);
                  }
                }
              }
            }
          };
          
          const selectedLevel = selectedIndex - startIndex + 1;
          addDescendants(selectedNode, selectedLevel + 1, selectedLevel + 3, selectedNode);
        }
      }
      
      // Group by level
      const nodesByLevel = new Map<number, typeof nodesToDisplay>();
      nodesToDisplay.forEach(item => {
        if (!nodesByLevel.has(item.level)) {
          nodesByLevel.set(item.level, []);
        }
        nodesByLevel.get(item.level)!.push(item);
      });
      
      // First pass: calculate total width needed for each level
      const levelTotalWidths = new Map<number, number>();
      nodesByLevel.forEach((levelNodes, level) => {
        let totalWidth = 0;
        levelNodes.forEach((item, index) => {
          const width = calculateNodeWidth(item.node);
          totalWidth += width;
          if (index < levelNodes.length - 1) {
            totalWidth += NODE_GAP;
          }
        });
        levelTotalWidths.set(level, totalWidth);
      });
      
      // Find the maximum width across all levels
      const maxLevelWidth = Math.max(...Array.from(levelTotalWidths.values()), 0);
      
      // Calculate positions
      nodesByLevel.forEach((levelNodes, level) => {
        // Group nodes by parent
        const nodesByParent = new Map<string, typeof nodesToDisplay>();
        levelNodes.forEach(item => {
          const parentId = item.parent?.id || 'root';
          if (!nodesByParent.has(parentId)) {
            nodesByParent.set(parentId, []);
          }
          nodesByParent.get(parentId)!.push(item);
        });
        
        // Calculate positions for each parent group
        const parentGroups: { parentId: string; nodes: typeof nodesToDisplay; startX: number; width: number }[] = [];
        
        nodesByParent.forEach((siblingNodes, parentId) => {
          const parentPos = parentPositions.get(parentId);
          
          // Calculate group width with dynamic node widths
          let groupWidth = 0;
          const nodeWidths: number[] = [];
          siblingNodes.forEach((item, index) => {
            const width = calculateNodeWidth(item.node);
            nodeWidths.push(width);
            groupWidth += width;
            if (index < siblingNodes.length - 1) {
              groupWidth += NODE_GAP;
            }
          });
          
          let idealStartX: number;
          if (parentPos) {
            // Center children under parent
            idealStartX = parentPos.x + parentPos.width / 2 - groupWidth / 2;
          } else {
            // No parent, start from left
            idealStartX = NODE_GAP;
          }
          
          parentGroups.push({
            parentId,
            nodes: siblingNodes,
            startX: idealStartX,
            width: groupWidth
          });
        });
        
        // Sort groups by ideal start position
        parentGroups.sort((a, b) => a.startX - b.startX);
        
        // Adjust positions to prevent overlaps
        for (let i = 0; i < parentGroups.length; i++) {
          const group = parentGroups[i];
          
          // Check overlap with previous groups
          if (i > 0) {
            const prevGroup = parentGroups[i - 1];
            const prevEnd = prevGroup.startX + prevGroup.width + NODE_GAP;
            if (group.startX < prevEnd) {
              // Adjust position to avoid overlap
              group.startX = prevEnd;
            }
          }
          
          // Ensure minimum margin from left
          group.startX = Math.max(NODE_GAP, group.startX);
        }
        
        // Calculate level width after adjustments
        const adjustedLevelWidth = parentGroups.length > 0
          ? parentGroups[parentGroups.length - 1].startX + parentGroups[parentGroups.length - 1].width - parentGroups[0].startX
          : 0;
        
        // Center the entire level
        const centerOffset = (maxLevelWidth - adjustedLevelWidth) / 2;
        
        // Position nodes within each group
        parentGroups.forEach(group => {
          const nodeWidths: number[] = [];
          group.nodes.forEach(item => {
            nodeWidths.push(calculateNodeWidth(item.node));
          });
          
          let xOffset = 0;
          group.nodes.forEach((item, index) => {
            const x = group.startX + xOffset + centerOffset;
            const y = (level - 1) * LEVEL_HEIGHT;
            const width = nodeWidths[index];
            
            const position: NodePosition = {
              node: item.node,
              x,
              y,
              width,
              height: NODE_HEIGHT,
              level,
              isPath: pathIds.has(item.node.id)
            };
            
            positions.push(position);
            parentPositions.set(item.node.id, position);
            
            xOffset += width + NODE_GAP;
          });
        });
      });
      
      setNodePositions(positions);
    };
    
    calculatePositions();
  }, [selectedNode, allNodes]);
  
  // Calculate SVG dimensions with proper margins
  const maxX = Math.max(...nodePositions.map(p => p.x + p.width), 0);
  const svgWidth = maxX > 0 ? maxX + NODE_GAP * 2 : 600; // Minimum width of 600px
  const svgHeight = Math.max(...nodePositions.map(p => p.y + p.height), 100) + NODE_GAP;
  
  // Draw connections
  const connections: JSX.Element[] = [];
  const nodePositionMap = new Map(nodePositions.map(p => [p.node.id, p]));
  
  nodePositions.forEach(parentPos => {
    if (parentPos.node.children) {
      parentPos.node.children.forEach(child => {
        const childPos = nodePositionMap.get(child.id);
        if (childPos) {
          const startX = parentPos.x + parentPos.width / 2;
          const startY = parentPos.y + parentPos.height;
          const endX = childPos.x + childPos.width / 2;
          const endY = childPos.y;
          
          connections.push(
            <g key={`${parentPos.node.id}-${child.id}`}>
              <line
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={parentPos.isPath && childPos.isPath ? "#10b981" : "#d1d5db"}
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            </g>
          );
        }
      });
    }
  });
  
  if (nodePositions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No call flow to display</p>
        </div>
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="h-full bg-gray-50 overflow-auto flex justify-center">
      <div className="p-6 min-w-max inline-block">
        <svg width={svgWidth} height={svgHeight} className="overflow-visible">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#9ca3af"
            />
          </marker>
        </defs>
        
        {connections}
        
        {nodePositions.map(pos => (
          <g key={pos.node.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              rx="8"
              className={cn(
                "cursor-pointer transition-all",
                selectedNode?.id === pos.node.id
                  ? "fill-blue-100 stroke-blue-500"
                  : pos.isPath
                  ? "fill-green-100 stroke-green-500"
                  : "fill-white stroke-gray-300 hover:fill-gray-50"
              )}
              strokeWidth="2"
              onClick={() => onNodeSelect(pos.node)}
            />
            <foreignObject
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              className="pointer-events-none"
            >
              <div className="h-full flex flex-col items-center justify-center p-2">
                <div className="font-medium text-sm text-center break-words line-clamp-2">
                  {pos.node.functionName}
                </div>
                <div className="text-xs text-gray-500 text-center mt-1">
                  {pos.node.selfTime.toLocaleString()} cycles
                  {pos.node.children && pos.node.children.length > 0 && `, ${pos.node.children.length} call${pos.node.children.length === 1 ? '' : 's'}`}
                </div>
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
      </div>
    </div>
  );
}