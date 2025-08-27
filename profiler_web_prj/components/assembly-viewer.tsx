'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, Settings } from 'lucide-react';
import { AssemblyData, PcLineData } from '@/types/profiler';
import { getAssemblyForFunction } from '@/app/actions/assembly';
import { cn } from '@/lib/utils';

interface AssemblyViewerProps {
  objectFile?: string;
  pcData?: Record<string, PcLineData>;
  selectedEvents: Set<string>;
  hotspotSettings: {
    event: string;
    threshold: number;
  };
  availableEvents: string[];
  highlightedPc?: string | null;
  highlightedLine?: number | null;
  onPcClick?: (pc: string) => void;
  isDarkTheme?: boolean;
  syntaxOnlyMode?: boolean;
  eventAlignLeft?: boolean;
}

// Assembly cache to avoid redundant objdump calls
const assemblyCache = new Map<string, AssemblyData>();

export function AssemblyViewer({ 
  objectFile, 
  pcData,
  selectedEvents,
  hotspotSettings,
  availableEvents,
  highlightedPc,
  highlightedLine,
  onPcClick,
  isDarkTheme = true,
  syntaxOnlyMode = false,
  eventAlignLeft = false
}: AssemblyViewerProps) {
  const [assemblyData, setAssemblyData] = useState<AssemblyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKeyRef = useRef<string>('');

  useEffect(() => {
    const fetchAssembly = async () => {
      if (!objectFile || !pcData || Object.keys(pcData).length === 0) {
        setAssemblyData(null);
        return;
      }

      // Create a cache key based on objectFile and PC addresses
      const pcAddresses = Object.keys(pcData).sort().join(',');
      const cacheKey = `${objectFile}:${pcAddresses}`;
      
      // Check if we already have the same data loaded
      if (cacheKeyRef.current === cacheKey && assemblyData) {
        return;
      }
      
      // Check if we have cached data
      const cached = assemblyCache.get(cacheKey);
      if (cached) {
        setAssemblyData(cached);
        cacheKeyRef.current = cacheKey;
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const objdumpCommand = localStorage.getItem('profiler-objdump-command') || 'objdump';
        const data = await getAssemblyForFunction(objectFile, pcData, objdumpCommand);
        setAssemblyData(data);
        
        // Cache the result
        assemblyCache.set(cacheKey, data);
        cacheKeyRef.current = cacheKey;
        
        // Limit cache size to prevent memory issues
        if (assemblyCache.size > 10) {
          const firstKey = assemblyCache.keys().next().value;
          assemblyCache.delete(firstKey);
        }
      } catch (err: any) {
        // Provide more specific error messages
        if (err.message?.includes('Permission denied')) {
          setError('Permission denied: Cannot read the object file. Please check file permissions.');
        } else if (err.message?.includes('objdump not found')) {
          setError('objdump not found: Please ensure objdump is installed on your system.');
        } else if (err.message?.includes('Invalid file format')) {
          setError('Invalid file format: The specified file is not a valid object file.');
        } else {
          setError(err.message || 'Failed to load assembly code');
        }
        console.error('Error fetching assembly:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssembly();
  }, [objectFile, pcData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Loading Assembly...</div>
          <div className="text-sm">Fetching machine code</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Error</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!assemblyData || assemblyData.instructions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Assembly View</div>
          <div className="text-sm">
            {!objectFile ? 'No object file specified' : 
             !pcData ? 'No PC data available' : 
             'No assembly instructions found'}
          </div>
        </div>
      </div>
    );
  }

  // Check if instruction is a hotspot
  const isHotspot = (events?: Record<string, number>): boolean => {
    if (!events) return false;
    const value = events[hotspotSettings.event] || 0;
    return value > hotspotSettings.threshold;
  };

  return (
    <div className={cn(
      "h-full overflow-auto assembly-viewer",
      isDarkTheme ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"
    )}>
      <table className="w-full font-mono text-sm">
        {selectedEvents.size > 0 && (
          <thead className={cn(
            "sticky top-0 border-b",
            isDarkTheme ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"
          )}>
            <tr>
              <th className={cn(
                "text-left px-4 py-2 text-xs font-medium",
                isDarkTheme ? "text-gray-400" : "text-gray-600"
              )} style={{ width: '100px' }}>Address</th>
              {eventAlignLeft && (
                <>
                  {Array.from(selectedEvents).map(event => (
                    <th key={event} className={cn(
                      "px-3 py-2 text-xs font-medium whitespace-nowrap text-right",
                      isDarkTheme ? "text-gray-400" : "text-gray-600"
                    )}
                    style={{ width: '80px' }}
                    >
                      {event}
                    </th>
                  ))}
                </>
              )}
              <th className={cn(
                "text-left px-4 py-2 text-xs font-medium",
                isDarkTheme ? "text-gray-400" : "text-gray-600"
              )} style={{ width: '100%' }}>Instruction</th>
              {!eventAlignLeft && (
                <>
                  {Array.from(selectedEvents).map(event => (
                    <th key={event} className={cn(
                      "px-3 py-2 text-xs font-medium whitespace-nowrap text-right",
                      isDarkTheme ? "text-gray-400" : "text-gray-600"
                    )}
                    style={{ width: '80px' }}
                    >
                      {event}
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>
        )}
        <tbody>
          {assemblyData.instructions.map((inst, index) => {
            const isExecuted = inst.executed || false;
            const isHotspotInst = isHotspot(inst.events);
            const isHighlighted = highlightedPc === inst.pc;
            const isLineHighlighted = highlightedLine && pcData?.[inst.pc]?.line === highlightedLine;
            const hasEvents = inst.events && Object.keys(inst.events).length > 0;
            
            return (
              <tr
                key={`${inst.pc}-${index}`}
                onClick={() => onPcClick?.(inst.pc)}
                className={cn(
                  "border-b cursor-pointer transition-all",
                  isDarkTheme ? "border-gray-800" : "border-gray-200",
                  (isHighlighted || isLineHighlighted) && "assembly-line-highlight"
                )}
                style={{
                  backgroundColor: syntaxOnlyMode ? 'transparent' : (
                    (isHighlighted || isLineHighlighted) ? 
                    'rgba(59, 130, 246, 0.3)' : 
                    isHotspotInst ? (isDarkTheme ? 'rgba(113, 63, 18, 0.3)' : 'rgba(251, 191, 36, 0.2)') :
                    isExecuted ? (isDarkTheme ? 'rgba(20, 83, 45, 0.2)' : 'rgba(34, 197, 94, 0.1)') :
                    (hasEvents && !isExecuted) ? (isDarkTheme ? 'rgba(127, 29, 29, 0.25)' : 'rgba(239, 68, 68, 0.1)') :
                    !hasEvents ? (isDarkTheme ? 'rgba(107, 114, 128, 0.2)' : 'rgba(156, 163, 175, 0.15)') :
                    'transparent'
                  )
                }}
              >
                <td className={cn(
                  "px-4 py-1 text-xs cursor-pointer hover:underline",
                  isDarkTheme ? (
                    isExecuted ? "text-blue-400" : "text-gray-600"
                  ) : (
                    isExecuted ? "text-blue-600" : "text-gray-400"
                  )
                )}
                style={{ width: '100px' }}
                onClick={() => onPcClick && onPcClick(inst.pc)}
                >
                  {inst.pc}
                </td>
                
                {/* Event columns when aligned left */}
                {eventAlignLeft && (
                  <>
                    {Array.from(selectedEvents).map(event => (
                      <td key={event} className={cn(
                        "px-3 py-1 text-xs whitespace-nowrap text-right font-mono",
                        isDarkTheme ? (
                          isExecuted ? "text-gray-300" : "text-gray-600"
                        ) : (
                          isExecuted ? "text-gray-700" : "text-gray-400"
                        )
                      )}
                      style={{ width: '80px' }}
                      >
                        {inst.events?.[event] ? inst.events[event].toLocaleString() : '-'}
                      </td>
                    ))}
                  </>
                )}
                
                <td className={cn(
                  "px-4 py-1",
                  isDarkTheme ? (
                    isExecuted ? "text-gray-100" : "text-gray-500"
                  ) : (
                    isExecuted ? "text-gray-900" : "text-gray-500"
                  )
                )} style={{ width: '100%' }}>
                  <pre className="m-0 p-0">{inst.instruction}</pre>
                </td>
                
                {/* Event columns when aligned right */}
                {!eventAlignLeft && (
                  <>
                    {Array.from(selectedEvents).map(event => (
                      <td key={event} className={cn(
                        "px-3 py-1 text-xs whitespace-nowrap text-right font-mono",
                        isDarkTheme ? (
                          isExecuted ? "text-gray-300" : "text-gray-600"
                        ) : (
                          isExecuted ? "text-gray-700" : "text-gray-400"
                        )
                      )}
                      style={{ width: '80px' }}
                      >
                        {inst.events?.[event] ? inst.events[event].toLocaleString() : '-'}
                      </td>
                    ))}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}