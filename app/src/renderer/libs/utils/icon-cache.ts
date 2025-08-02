// Simple in-memory cache for app icons
class IconCache {
  private cache = new Map<string, string | null>();
  private readonly maxSize = 50;
  private preloadPromise: Promise<void> | null = null;

  get(appName: string): string | null | undefined {
    return this.cache.get(appName);
  }

  set(appName: string, iconPath: string | null): void {
    // If cache is full, remove the oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(appName, iconPath);
  }

  // Initialize cache with preloaded icons
  async initializePreloadedIcons(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.preloadPromise = this.doInitializePreloadedIcons();
    return this.preloadPromise;
  }

  private async doInitializePreloadedIcons(): Promise<void> {
    try {
      if (window.activeAppAPI) {
        const preloadedIcons = await window.activeAppAPI.getPreloadedIcons();
        console.log(
          `🚀 Loading ${Object.keys(preloadedIcons).length} preloaded icons into cache`,
        );

        for (const [appName, iconData] of Object.entries(preloadedIcons)) {
          this.cache.set(appName, iconData);
        }

        console.log(
          `✅ Initialized icon cache with ${this.cache.size} preloaded icons`,
        );
      }
    } catch (error) {
      console.error("Failed to initialize preloaded icons:", error);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  has(appName: string): boolean {
    return this.cache.has(appName);
  }

  delete(appName: string): boolean {
    return this.cache.delete(appName);
  }

  // Clear cache for apps that are no longer in the provided list
  cleanup(currentApps: string[]): void {
    const currentAppSet = new Set(currentApps);
    for (const cachedApp of this.cache.keys()) {
      if (!currentAppSet.has(cachedApp)) {
        this.cache.delete(cachedApp);
      }
    }
  }
}

export const iconCache = new IconCache();
