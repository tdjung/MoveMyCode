'use client';

import { useState, useRef, useEffect } from 'react';
import { CachegrindData } from '@/types/profiler';
import { Sidebar } from './sidebar';
import { FileViewer } from './file-viewer';
import { OverviewDashboard } from './overview-dashboard';
import { CallTreeViewer } from './call-tree-viewer';

interface ProfilerDashboardProps {
  data: CachegrindData;
  onReset?: () => void;
}

export function ProfilerDashboard({ data, onReset }: ProfilerDashboardProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [showCallTree, setShowCallTree] = useState(false);
  const [callTreeEntryPoint, setCallTreeEntryPoint] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320); // Default width
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const handleFunctionSelect = (funcName: string | null, fileName: string | null) => {
    setSelectedFunction(funcName);
    if (fileName) {
      setSelectedFile(fileName);
    }
  };

  const handleCallTreeView = () => {
    setShowCallTree(true);
    setCallTreeEntryPoint(null); // Reset entry point
    setSelectedFile(null);
    setSelectedFunction(null);
  };
  
  const handleCallTreeWithEntry = (functionName: string) => {
    setShowCallTree(true);
    setCallTreeEntryPoint(functionName);
    setSelectedFile(null);
    setSelectedFunction(null);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(280, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <div ref={sidebarRef} style={{ width: `${sidebarWidth}px` }} className="relative flex-shrink-0">
        <Sidebar 
          data={data}
          selectedFile={selectedFile}
          selectedFunction={selectedFunction}
          onFileSelect={(file) => {
            setSelectedFile(file);
            setShowCallTree(false);
          }}
          onFunctionSelect={handleFunctionSelect}
          onReset={onReset}
          onCallTreeView={handleCallTreeView}
          isCallTreeActive={showCallTree}
        />
        {/* Resize handle */}
        <div 
          className="absolute top-0 right-0 w-1 h-full bg-gray-300 hover:bg-blue-500 cursor-ew-resize transition-colors"
          onMouseDown={handleMouseDown}
        />
      </div>
      
      <div className="flex-1 overflow-hidden">
        {showCallTree ? (
          <CallTreeViewer data={data} entryPoint={callTreeEntryPoint} />
        ) : selectedFile && data.fileCoverage[selectedFile] ? (
          <FileViewer 
            filename={selectedFile}
            fileData={data.fileCoverage[selectedFile]}
            selectedFunction={selectedFunction}
            onCallTreeView={handleCallTreeWithEntry}
          />
        ) : selectedFile ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">File data not available</p>
          </div>
        ) : (
          <OverviewDashboard data={data} />
        )}
      </div>
    </div>
  );
}