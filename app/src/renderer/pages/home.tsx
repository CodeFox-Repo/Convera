import React from "react";

export default function HomePage() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white">
          FoxyChat
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Welcome to the main application window!
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          This is the primary interface for FoxyChat
        </div>
      </div>
    </div>
  );
}
