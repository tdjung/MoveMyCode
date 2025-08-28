import { CallTreeNode } from '@/types/profiler';

export interface SearchIndex {
  termToNodes: Map<string, Set<CallTreeNode>>;
  nodeToTerms: Map<CallTreeNode, Set<string>>;
}

export class CallTreeSearchEngine {
  private index: SearchIndex;
  
  constructor() {
    this.index = {
      termToNodes: new Map(),
      nodeToTerms: new Map()
    };
  }
  
  /**
   * Build search index from call tree nodes
   * Creates indices for both full names and partial matches
   */
  buildIndex(nodes: CallTreeNode[]): void {
    this.index = {
      termToNodes: new Map(),
      nodeToTerms: new Map()
    };
    
    const visited = new Set<string>(); // Prevent circular references
    
    const indexNode = (node: CallTreeNode, depth: number = 0) => {
      // Prevent infinite recursion
      if (depth > 100 || visited.has(node.id)) {
        return;
      }
      visited.add(node.id);
      
      try {
        const functionNameLower = node.functionName.toLowerCase();
        
        // Index full function name
        this.addToIndex(functionNameLower, node);
        
        // Index word boundaries for better search
        // Split on non-alphanumeric, camelCase, and snake_case
        const words = node.functionName
          .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
          .replace(/_/g, ' ') // snake_case
          .split(/[^a-zA-Z0-9]+/)
          .filter(w => w.length > 1);
        
        words.forEach(word => {
          this.addToIndex(word.toLowerCase(), node);
        });
        
        // Optimized substring indexing - balance between search coverage and performance
        const nameLength = functionNameLower.length;
        
        // Always index key prefixes (most common search pattern)
        const maxPrefixLength = Math.min(nameLength, 12);
        for (let len = 1; len <= maxPrefixLength; len++) {
          this.addToIndex(functionNameLower.substring(0, len), node);
        }
        
        // Index suffixes for common patterns
        if (nameLength > 3) {
          const maxSuffixLength = Math.min(nameLength, 8);
          for (let len = 3; len <= maxSuffixLength; len++) {
            this.addToIndex(functionNameLower.substring(nameLength - len), node);
          }
        }
        
        // For very short names, also index middle substrings
        if (nameLength <= 8) {
          for (let start = 1; start < nameLength - 1; start++) {
            for (let len = 2; len <= Math.min(4, nameLength - start); len++) {
              this.addToIndex(functionNameLower.substring(start, start + len), node);
            }
          }
        }
        
        // Recursively index children with depth limit
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach(child => {
            if (child && typeof child === 'object') {
              indexNode(child, depth + 1);
            }
          });
        }
      } catch (error) {
        console.warn('Error indexing node:', node.functionName, error);
      }
    };
    
    // Index all root nodes
    if (nodes && Array.isArray(nodes)) {
      nodes.forEach(node => {
        if (node && typeof node === 'object') {
          indexNode(node);
        }
      });
    }
  }
  
  private addToIndex(term: string, node: CallTreeNode): void {
    if (!this.index.termToNodes.has(term)) {
      this.index.termToNodes.set(term, new Set());
    }
    this.index.termToNodes.get(term)!.add(node);
    
    if (!this.index.nodeToTerms.has(node)) {
      this.index.nodeToTerms.set(node, new Set());
    }
    this.index.nodeToTerms.get(node)!.add(term);
  }
  
  /**
   * Search for nodes matching the given term
   * Returns a set of matching nodes
   */
  search(searchTerm: string): Set<CallTreeNode> {
    if (!searchTerm || searchTerm.trim() === '') {
      return new Set();
    }
    
    const termLower = searchTerm.toLowerCase().trim();
    const results = new Set<CallTreeNode>();
    
    // Direct match first (most efficient)
    const directMatches = this.index.termToNodes.get(termLower);
    if (directMatches) {
      directMatches.forEach(node => results.add(node));
    }
    
    // If we have few or no direct matches, try prefix matching
    if (results.size < 10) {
      // Look for terms that start with the search term
      this.index.termToNodes.forEach((nodes, indexedTerm) => {
        if (indexedTerm.startsWith(termLower)) {
          nodes.forEach(node => results.add(node));
        }
      });
    }
    
    // If still few results, try substring matching (more expensive)
    if (results.size < 5) {
      this.index.termToNodes.forEach((nodes, indexedTerm) => {
        // Skip if already checked
        if (!indexedTerm.startsWith(termLower) && indexedTerm.includes(termLower)) {
          nodes.forEach(node => results.add(node));
        }
      });
    }
    
    return results;
  }
  
  /**
   * Get all ancestors of matching nodes for tree expansion
   * Optimized version that builds parent map first
   */
  getAncestorsToExpand(matches: Set<CallTreeNode>, allNodes: CallTreeNode[]): Set<string> {
    const toExpand = new Set<string>();
    
    // First, build a parent map for O(1) ancestor lookup
    const parentMap = new Map<string, string>();
    const buildParentMap = (node: CallTreeNode, parentId: string | null = null) => {
      if (parentId) {
        parentMap.set(node.id, parentId);
      }
      
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
          if (child && typeof child === 'object') {
            buildParentMap(child, node.id);
          }
        });
      }
    };
    
    // Build parent map from all root nodes
    allNodes.forEach(root => {
      if (root && typeof root === 'object') {
        buildParentMap(root);
      }
    });
    
    // Now expand ancestors for each match
    const matchArray = Array.from(matches).slice(0, 30); // Limit for performance
    matchArray.forEach(match => {
      let currentId = match.id;
      let depth = 0;
      
      // Walk up the parent chain
      while (parentMap.has(currentId) && depth < 20) {
        const parentId = parentMap.get(currentId)!;
        toExpand.add(parentId);
        currentId = parentId;
        depth++;
      }
    });
    
    return toExpand;
  }
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}