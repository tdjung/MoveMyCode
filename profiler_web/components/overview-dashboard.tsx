'use client';

import { Activity, FileText, Code, TrendingUp, Cpu, Zap, HardDrive } from 'lucide-react';
import { CachegrindData } from '@/types/profiler';
import { formatPercentage, getCoverageColor, cn } from '@/lib/utils';

interface OverviewDashboardProps {
  data: CachegrindData;
}

export function OverviewDashboard({ data }: OverviewDashboardProps) {
  // Calculate cache efficiency metrics
  const cacheMetrics = calculateCacheMetrics(data.summaryTotals);
  
  return (
    <div className="p-8 overflow-y-auto h-full bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Performance Analysis Dashboard</h2>
          <p className="text-gray-600">{data.projectName}</p>
        </div>

        {/* Performance Events Summary */}
        <div className="mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-800">Performance Events</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(data.summaryTotals).map(([event, count]) => (
                <div key={event} className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">{getEventDescription(event)}</div>
                  <div className="text-2xl font-bold text-gray-800">{count.toLocaleString()}</div>
                  <div className="text-xs text-gray-500 mt-1">{event}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-800">Performance Metrics</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cycle & Performance - Now on the left */}
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-gray-800">Cycle & Performance Metrics</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Instructions</span>
                    <span className="font-semibold text-gray-800">{(data.summaryTotals.Ir || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Cycles</span>
                    <span className="font-semibold text-gray-800">{(data.summaryTotals.Cy || data.summaryTotals.Ir || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Instructions per Cycle</span>
                    <span className="font-semibold text-gray-800">{cacheMetrics.ipc.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Branch Prediction Metrics - Replacing Cache Efficiency */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-800">Branch Prediction Metrics</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Branch Prediction Rate</span>
                    <span className="font-semibold text-gray-800">{formatPercentage(calculateBranchPredictionRate(data.summaryTotals))}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Branches</span>
                    <span className="font-semibold text-gray-800">{((data.summaryTotals.Bc || 0) + (data.summaryTotals.Bi || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Miss-predictions</span>
                    <span className="font-semibold text-gray-800">{((data.summaryTotals.Bcm || 0) + (data.summaryTotals.Bim || 0)).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Coverage */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-800">Code Coverage Summary</h3>
          </div>
          
          {/* Overall Coverage */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Overall Coverage</span>
              <span className={cn("text-2xl font-bold", getCoverageColor(data.coveragePercentage))}>
                {formatPercentage(data.coveragePercentage)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className={cn(
                  "h-2.5 rounded-full transition-all duration-500",
                  data.coveragePercentage >= 80 ? "bg-green-500" :
                  data.coveragePercentage >= 60 ? "bg-yellow-500" : "bg-red-500"
                )}
                style={{ width: `${data.coveragePercentage}%` }}
              />
            </div>
          </div>

          {/* Coverage Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-800">{data.filesAnalyzed}</div>
              <div className="text-sm text-gray-600">Files Analyzed</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <Code className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-800">{data.totalLines.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Lines</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <Activity className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-700">{data.coveredLines.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Covered Lines</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <TrendingUp className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-700">
                {(data.totalLines - data.coveredLines).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Uncovered Lines</div>
            </div>
          </div>

          {/* File Coverage Table */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-600 mb-3">File Coverage Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">File</th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Coverage</th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Lines</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.fileCoverage)
                    .sort((a, b) => b[1].coveragePercentage - a[1].coveragePercentage)
                    .slice(0, 10)
                    .map(([filename, fileData]) => (
                      <tr key={filename} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-sm text-gray-800">{filename}</td>
                        <td className={cn("py-2 px-3 text-sm text-right font-medium", 
                          getCoverageColor(fileData.coveragePercentage))}>
                          {formatPercentage(fileData.coveragePercentage)}
                        </td>
                        <td className="py-2 px-3 text-sm text-right text-gray-600">
                          {fileData.coveredLines} / {fileData.totalLines}
                        </td>
                        <td className="py-2 px-3">
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className={cn(
                                "h-1.5 rounded-full",
                                fileData.coveragePercentage >= 80 ? "bg-green-500" :
                                fileData.coveragePercentage >= 60 ? "bg-yellow-500" : "bg-red-500"
                              )}
                              style={{ width: `${fileData.coveragePercentage}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getEventDescription(event: string): string {
  const descriptions: Record<string, string> = {
    'Ir': 'Instructions Executed',
    'Dr': 'Data Reads',
    'Dw': 'Data Writes',
    'I1mr': 'L1 Instruction Misses',
    'ILmr': 'LL Instruction Misses',
    'D1mr': 'L1 Data Read Misses',
    'DLmr': 'LL Data Read Misses',
    'D1mw': 'L1 Data Write Misses',
    'DLmw': 'LL Data Write Misses',
    'Bc': 'Conditional Branches',
    'Bcm': 'Conditional Branch Misses',
    'Bi': 'Indirect Branches',
    'Bim': 'Indirect Branch Misses'
  };
  return descriptions[event] || event;
}

function calculateCacheMetrics(summaryTotals: Record<string, number>) {
  const dr = summaryTotals.Dr || 0;
  const dw = summaryTotals.Dw || 0;
  const d1mr = summaryTotals.D1mr || 0;
  const d1mw = summaryTotals.D1mw || 0;
  const ir = summaryTotals.Ir || 0;
  const i1mr = summaryTotals.I1mr || 0;
  
  const totalDataAccesses = dr + dw;
  const totalDataMisses = d1mr + d1mw;
  const dataHitRate = totalDataAccesses > 0 ? 
    ((totalDataAccesses - totalDataMisses) / totalDataAccesses) * 100 : 100;
  
  const instructionHitRate = ir > 0 ? ((ir - i1mr) / ir) * 100 : 100;
  
  const totalMisses = totalDataMisses + i1mr;
  const totalMemoryAccesses = totalDataAccesses + ir;
  
  const cycles = summaryTotals.Cy || ir || 1;
  const ipc = cycles > 0 ? ir / cycles : 0;
  
  return {
    dataHitRate,
    instructionHitRate,
    totalMisses,
    totalMemoryAccesses,
    ipc
  };
}

function calculateBranchPredictionRate(summaryTotals: Record<string, number>) {
  const bc = summaryTotals.Bc || 0;
  const bi = summaryTotals.Bi || 0;
  const bcm = summaryTotals.Bcm || 0;
  const bim = summaryTotals.Bim || 0;
  
  const totalBranches = bc + bi;
  const totalMisses = bcm + bim;
  
  if (totalBranches === 0) return 100;
  
  const predictionRate = ((totalBranches - totalMisses) / totalBranches) * 100;
  return predictionRate;
}