'use client';

import { useState } from 'react';
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

  const handleFunctionSelect = (funcName: string | null, fileName: string | null) => {
    setSelectedFunction(funcName);
    if (fileName) {
      setSelectedFile(fileName);
    }
  };

  const handleCallTreeView = () => {
    setShowCallTree(true);
    setSelectedFile(null);
    setSelectedFunction(null);
  };

  return (
    <div className="h-screen flex bg-gray-100">
      
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
      
      <div className="flex-1 overflow-hidden">
        {showCallTree ? (
          <CallTreeViewer data={data} />
        ) : selectedFile && data.fileCoverage[selectedFile] ? (
          <FileViewer 
            filename={selectedFile}
            fileData={data.fileCoverage[selectedFile]}
            selectedFunction={selectedFunction}
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