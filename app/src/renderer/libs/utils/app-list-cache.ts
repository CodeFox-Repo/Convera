// Cache for opened apps list to reduce AppleScript calls
class AppListCache {
  private apps: string[] = [];
  private lastUpdate = 0;
  private readonly cacheTimeout = 600; // 600ms cache - faster responsiveness for app exits

  get(): string[] | null {
    const now = Date.now();
    const timeElapsed = now - this.lastUpdate;
    if (timeElapsed < this.cacheTimeout) {
      console.log(
        `📦 Cache hit: ${this.apps.length} apps (${Math.round(timeElapsed)}ms old)`,
      );
      return this.apps;
    }
    console.log(
      `🔄 Cache miss: expired ${Math.round(timeElapsed - this.cacheTimeout)}ms ago`,
    );
    return null; // Cache expired
  }

  set(apps: string[]): void {
    this.apps = [...apps];
    this.lastUpdate = Date.now();
    console.log(`💾 Cached ${apps.length} apps`);
  }

  isValid(): boolean {
    const now = Date.now();
    return now - this.lastUpdate < this.cacheTimeout;
  }

  clear(): void {
    this.apps = [];
    this.lastUpdate = 0;
  }
}

export const appListCache = new AppListCache();
