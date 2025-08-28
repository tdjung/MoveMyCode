'use client';

import { useState } from 'react';
import { FileUpload } from '@/components/file-upload';
import { ServerFileBrowser } from '@/components/server-file-browser';
import { ProfilerDashboard } from '@/components/profiler-dashboard';
import { LoadingSpinner } from '@/components/loading-spinner';
import { parseCachegrindFile, readServerFile } from '@/app/actions/profiler';
import { CachegrindData } from '@/types/profiler';
import { BarChart3, AlertCircle, Upload, HardDrive } from 'lucide-react';

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [data, setData] = useState<CachegrindData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileSource, setFileSource] = useState<'client' | 'server'>('client');

  const handleFileSelect = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const result = await parseCachegrindFile(formData);
      
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to parse file');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleServerFileSelect = async (filePath: string) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Read file content from server
      const fileResult = await readServerFile(filePath);
      
      if (!fileResult.success || !fileResult.content) {
        setError(fileResult.error || 'Failed to read file from server');
        return;
      }
      
      // Create a File object from the content
      const fileName = filePath.split('/').pop() || 'file';
      const file = new File([fileResult.content], fileName, { type: 'text/plain' });
      
      // Parse the file
      const formData = new FormData();
      formData.append('file', file);
      
      const result = await parseCachegrindFile(formData);
      
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to parse file');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (data) {
    return <ProfilerDashboard data={data} onReset={() => setData(null)} />;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-4">
            <BarChart3 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Performance Profiler
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Analyze profiling output files to visualize code coverage and performance metrics. 
            Upload your profiling file to get started.
          </p>
        </div>

        {/* Upload Section */}
        <div className="max-w-4xl mx-auto">
          {/* File Source Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex rounded-lg border border-gray-300 bg-white shadow-sm">
              <button
                onClick={() => setFileSource('client')}
                className={`flex items-center gap-2 px-6 py-3 rounded-l-lg transition-colors ${
                  fileSource === 'client' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Upload className="w-4 h-4" />
                Upload from Computer
              </button>
              <button
                onClick={() => setFileSource('server')}
                className={`flex items-center gap-2 px-6 py-3 rounded-r-lg transition-colors ${
                  fileSource === 'server' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                Browse Server Files
              </button>
            </div>
          </div>

          {!isProcessing && !error && (
            fileSource === 'client' ? (
              <FileUpload 
                onFileSelect={handleFileSelect}
                isProcessing={isProcessing}
              />
            ) : (
              <ServerFileBrowser
                onFileSelect={handleServerFileSelect}
                isProcessing={isProcessing}
                initialDirectory="output"
              />
            )
          )}

          {isProcessing && <LoadingSpinner />}

          {error && (
            <div className="bg-white rounded-xl shadow-sm p-8 border border-red-200">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-800 mb-2">
                    Error Processing File
                  </h3>
                  <p className="text-red-600 mb-4">{error}</p>
                  <button
                    onClick={() => {
                      setError(null);
                      setData(null);
                    }}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Performance Analysis
            </h3>
            <p className="text-gray-600 text-sm">
              Visualize cache misses, instruction reads, and other performance metrics
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Code Coverage
            </h3>
            <p className="text-gray-600 text-sm">
              See which lines of code were executed and identify untested areas
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Function Analysis
            </h3>
            <p className="text-gray-600 text-sm">
              Drill down into function-level metrics and performance data
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}