export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-4 border-gray-200"></div>
        <div className="absolute top-0 h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      </div>
      <span className="ml-4 text-gray-600">Processing cachegrind data...</span>
    </div>
  );
}