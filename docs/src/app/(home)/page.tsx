import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="relative flex min-h-[90vh] w-full items-center justify-center overflow-hidden bg-[#1c1f2b] text-white dark:bg-[#1c1f2b] dark:text-white bg-gray-50 text-gray-900">
        {/* Dark mode gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1c1f2b] via-[#2a2d3d] to-[#1c1f2b] dark:opacity-100 opacity-0"></div>
        
        {/* Light mode gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 opacity-100 dark:opacity-0"></div>
        
        {/* Dark mode grid */}
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] bg-center opacity-0 dark:opacity-20"></div>
        
        {/* Light mode grid */}
        <div className="absolute inset-0 bg-[url('/grid-pattern-light.svg')] bg-[length:30px_30px] bg-center opacity-20 dark:opacity-0"></div>
        
        {/* Top gradient - dark mode */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#121212] via-[#121212]/80 to-transparent dark:opacity-100 opacity-0 z-10"></div>
        
        {/* Top gradient - light mode */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#f1f1f1] via-[#f1f1f1]/95 to-[#f1f1f1]/0 opacity-100 dark:opacity-0 z-10"></div>
        
        {/* Glow effects */}
        <div className="absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-500/10 dark:bg-orange-500/20 blur-3xl"></div>
        <div className="absolute right-1/4 bottom-1/3 h-64 w-64 rounded-full bg-blue-500/10 dark:bg-blue-500/20 blur-3xl"></div>
        
        <div className="container relative mx-auto max-w-6xl px-4">
          <div className="flex flex-col items-center justify-center text-center">
            <h1 className="mb-8 bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl">
              Convera Documentation
            </h1>
            <p className="mb-12 max-w-2xl text-lg text-gray-600 dark:text-gray-300 md:text-xl">
              All-in-one chat application built with Electron. Connect to various AI models through a clean, intuitive interface.
            </p>
            <Link
              href="/docs"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-orange-600 to-orange-500 px-8 py-3.5 font-medium text-white shadow-lg transition-all duration-300 hover:shadow-orange-500/30"
            >
              <span>Go to Docs</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              <span className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-500 to-orange-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
            </Link>
          </div>
        </div>
        
        {/* Dark mode footer gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0f111a] via-[#0f111a]/80 to-transparent dark:opacity-100 opacity-0"></div>
        
        {/* Light mode footer gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f1f1f1] via-[#f1f1f1]/95 to-transparent opacity-100 dark:opacity-0"></div>
      </div>
    </main>
  );
}
