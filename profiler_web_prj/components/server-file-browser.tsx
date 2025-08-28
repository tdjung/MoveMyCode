'use client';

import { useState, useEffect } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronLeft, HardDrive, AlertCircle } from 'lucide-react';
import { listServerFiles } from '@/app/actions/profiler';
import { formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface ServerFileBrowserProps {
  onFileSelect: (filePath: string) => void;
  isProcessing: boolean;
  initialDirectory?: string;
}

interface FileEntry {
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedTime: Date;
}

export function ServerFileBrowser({ onFileSelect, isProcessing, initialDirectory = 'output' }: ServerFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialDirectory);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await listServerFiles(path);
      
      if (result.success && result.files) {
        setFiles(result.files);
        if (result.currentPath) {
          setCurrentPath(result.currentPath);
        }
      } else {
        setError(result.error || 'Failed to load directory');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToDirectory = (dirName: string) => {
    if (dirName === '..') {
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      setCurrentPath(parts.join('/') || '.');
    } else {
      const newPath = currentPath ? `${currentPath}/${dirName}` : dirName;
      setCurrentPath(newPath);
    }
  };

  const handleFileClick = (file: FileEntry) => {
    if (file.isDirectory) {
      navigateToDirectory(file.name);
    } else {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      setSelectedFile(filePath);
      onFileSelect(filePath);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-800">Server Files</h3>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Path:</span>
            <span className="font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
              /{currentPath || 'root'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        {currentPath && (
          <div className="px-6 py-3 border-b border-gray-100">
            <button
              onClick={() => navigateToDirectory('..')}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              disabled={isProcessing}
            >
              <ChevronLeft className="w-4 h-4" />
              Back to parent directory
            </button>
          </div>
        )}

        {/* File List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="text-gray-500 mt-3">Loading files...</p>
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">Error loading files</p>
              </div>
              <p className="text-sm text-red-500 mt-2">{error}</p>
              <button
                onClick={() => loadDirectory(currentPath)}
                className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No files found in this directory</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {files.map((file) => (
                <div
                  key={file.name}
                  onClick={() => handleFileClick(file)}
                  className={cn(
                    "px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between",
                    selectedFile === `${currentPath}/${file.name}` && "bg-blue-50 hover:bg-blue-100",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {file.isDirectory ? (
                      <FolderOpen className="w-5 h-5 text-blue-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-gray-600" />
                    )}
                    <span className={cn(
                      "font-medium",
                      file.isDirectory ? "text-gray-800" : "text-gray-700"
                    )}>
                      {file.name}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {!file.isDirectory && (
                      <span>{formatBytes(file.size)}</span>
                    )}
                    <span>
                      {new Date(file.modifiedTime).toLocaleDateString()}
                    </span>
                    {file.isDirectory && (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && files.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-600">
            {files.filter(f => f.isDirectory).length} folders, {files.filter(f => !f.isDirectory).length} files
          </div>
        )}
      </div>
    </div>
  );
}