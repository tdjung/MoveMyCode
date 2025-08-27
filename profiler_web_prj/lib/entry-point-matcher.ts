import { CallTreeNode } from '@/types/profiler';

export interface EntryPointIndex {
  byName: Map<string, CallTreeNode>;
  byPcStart: Map<string, CallTreeNode>;
  byPartialName: Map<string, Set<CallTreeNode>>;  // For efficient partial matching
  pcRanges: Array<{
    start: number;
    end: number;
    node: CallTreeNode;
  }>;
}

export class EntryPointMatcher {
  private index: EntryPointIndex | null = null;
  
  /**
   * Build optimized lookup structures for entry point matching
   * O(n) build time, but enables O(1) or O(log n) lookups
   */
  buildIndex(nodeMap: Map<string, CallTreeNode>): void {
    const byName = new Map<string, CallTreeNode>();
    const byPcStart = new Map<string, CallTreeNode>();
    const byPartialName = new Map<string, Set<CallTreeNode>>();
    const pcRanges: EntryPointIndex['pcRanges'] = [];
    
    nodeMap.forEach(node => {
      const nameLower = node.functionName.toLowerCase();
      
      // Index by lowercase function name for O(1) lookup
      byName.set(nameLower, node);
      
      // Also index common variations
      const nameWithoutPrefix = node.functionName.replace(/^_+/, '').toLowerCase();
      if (nameWithoutPrefix !== nameLower) {
        byName.set(nameWithoutPrefix, node);
      }
      
      // Build optimized partial name index for key patterns only
      // Index prefixes (most common search pattern)
      const prefixLimit = Math.min(nameLower.length, 8);
      for (let len = 3; len <= prefixLimit; len++) {
        const prefix = nameLower.substring(0, len);
        if (!byPartialName.has(prefix)) {
          byPartialName.set(prefix, new Set());
        }
        byPartialName.get(prefix)!.add(node);
      }
      
      // Index word starts for word-based search
      const words = nameLower.split(/[^a-z0-9]+/);
      words.forEach((word, idx) => {
        if (word.length >= 3) {
          if (!byPartialName.has(word)) {
            byPartialName.set(word, new Set());
          }
          byPartialName.get(word)!.add(node);
          
          // Also index first few chars of each word
          for (let len = 3; len <= Math.min(word.length, 6); len++) {
            const wordPrefix = word.substring(0, len);
            if (!byPartialName.has(wordPrefix)) {
              byPartialName.set(wordPrefix, new Set());
            }
            byPartialName.get(wordPrefix)!.add(node);
          }
        }
      });
      
      // Index by PC start address for O(1) lookup
      if (node.pcStart) {
        byPcStart.set(node.pcStart.toLowerCase(), node);
      }
      
      // Build sorted array for PC range binary search
      if (node.pcStart && node.pcEnd) {
        const start = parseInt(node.pcStart, 16);
        const end = parseInt(node.pcEnd, 16);
        
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          pcRanges.push({ start, end, node });
        }
      }
    });
    
    // Sort ranges by start address for binary search
    pcRanges.sort((a, b) => a.start - b.start);
    
    this.index = {
      byName,
      byPcStart,
      byPartialName,
      pcRanges
    };
  }
  
  /**
   * Find entry node using optimized lookups
   * Returns the matching node or null
   */
  findEntryNode(entryPoint: string): CallTreeNode | null {
    if (!this.index || !entryPoint) return null;
    
    const trimmed = entryPoint.trim();
    const trimmedLower = trimmed.toLowerCase();
    
    // 1. Try exact function name match - O(1)
    const byName = this.index.byName.get(trimmedLower);
    if (byName) return byName;
    
    // 2. Try PC address formats
    if (trimmed.match(/^(0x)?[0-9a-fA-F]+$/)) {
      // Ensure it has 0x prefix
      const pcAddress = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
      const pcAddressLower = pcAddress.toLowerCase();
      
      // Try exact PC start match - O(1)
      const byPc = this.index.byPcStart.get(pcAddressLower);
      if (byPc) return byPc;
      
      // Try PC range match using binary search - O(log n)
      const addr = parseInt(pcAddress, 16);
      if (!isNaN(addr)) {
        return this.findByPcRange(addr);
      }
    }
    
    // 3. Try partial function name match using the partial index - O(1)
    if (trimmedLower.length >= 3) {
      const partialMatches = this.index.byPartialName.get(trimmedLower);
      if (partialMatches && partialMatches.size > 0) {
        // Return the first match
        return partialMatches.values().next().value;
      }
      
      // If no exact partial match, try starts-with as fallback
      for (const [name, node] of this.index.byName.entries()) {
        if (name.startsWith(trimmedLower)) {
          return node;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Binary search for PC address in ranges
   * O(log n) complexity
   */
  private findByPcRange(address: number): CallTreeNode | null {
    if (!this.index) return null;
    
    const ranges = this.index.pcRanges;
    let left = 0;
    let right = ranges.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const range = ranges[mid];
      
      if (address >= range.start && address <= range.end) {
        return range.node;
      }
      
      if (address < range.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    return null;
  }
  
  
  /**
   * Get suggestions for entry point based on partial input
   */
  getSuggestions(partial: string, limit: number = 10): Array<{
    value: string;
    label: string;
    node: CallTreeNode;
  }> {
    if (!this.index || !partial) return [];
    
    const partialLower = partial.toLowerCase().trim();
    const suggestions: Array<{ value: string; label: string; node: CallTreeNode }> = [];
    
    // Search function names
    for (const [name, node] of this.index.byName.entries()) {
      if (suggestions.length >= limit) break;
      
      if (name.includes(partialLower)) {
        suggestions.push({
          value: node.functionName,
          label: `${node.functionName} (function)`,
          node
        });
      }
    }
    
    // Search PC addresses
    if (partial.match(/^(0x)?[0-9a-fA-F]+$/)) {
      for (const [pc, node] of this.index.byPcStart.entries()) {
        if (suggestions.length >= limit) break;
        
        if (pc.includes(partialLower)) {
          suggestions.push({
            value: pc,
            label: `${pc} - ${node.functionName}`,
            node
          });
        }
      }
    }
    
    return suggestions;
  }
}