'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setError(null);
    
    // Validate file
    if (file.size > 100 * 1024 * 1024) { // 100MB
      setError('File size exceeds 100MB limit');
      return;
    }
    
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200",
          dragActive 
            ? "border-blue-500 bg-blue-50" 
            : "border-gray-300 bg-white hover:border-gray-400",
          isProcessing && "opacity-50 cursor-not-allowed"
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="*"
          onChange={handleChange}
          disabled={isProcessing}
        />
        
        <div 
          className={cn(
            "flex flex-col items-center justify-center p-12 cursor-pointer",
            isProcessing && "cursor-not-allowed"
          )}
          onClick={!isProcessing ? handleButtonClick : undefined}
        >
          <Upload className={cn(
            "w-16 h-16 mb-4 transition-colors",
            dragActive ? "text-blue-500" : "text-gray-400"
          )} />
          
          <p className="text-lg font-medium text-gray-700 mb-2">
            {selectedFile ? 'Select Another File' : 'Upload Profiling Output'}
          </p>
          
          <p className="text-sm text-gray-500 text-center">
            Drag and drop your profiling output file here, or click to browse
          </p>
          
          <p className="text-xs text-gray-400 mt-2">
            Maximum file size: 100MB
          </p>
          
          {selectedFile && !error && (
            <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">
                {selectedFile.name}
              </span>
              <span className="text-xs text-blue-600">
                ({formatBytes(selectedFile.size)})
              </span>
            </div>
          )}
          
          {error && (
            <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}