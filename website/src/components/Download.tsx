import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Apple,
  CheckCircle,
  Clock,
  Download as DownloadIcon,
  ExternalLink,
  FileText,
  Github,
  Globe,
  HardDrive,
  Loader2,
  Monitor,
  Shield,
  Smartphone,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
  }>;
}

const Download = () => {
  const { toast } = useToast();
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState({
    hero: false,
  });

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target.getAttribute("data-section");
            if (target) {
              setIsVisible((prev) => ({ ...prev, [target]: true }));
            }
          }
        });
      },
      { threshold: 0.1 },
    );

    const sections = document.querySelectorAll("[data-section]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Fetch latest release from homebrew-codefox repository
  useEffect(() => {
    const fetchLatestRelease = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          "https://api.github.com/repos/CodeFox-Repo/homebrew-codefox/releases/latest",
          {
            headers: {
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const release: GitHubRelease = await response.json();
        setLatestRelease(release);
      } catch (err) {
        console.error("Failed to fetch latest release:", err);
        setError("Failed to load latest version information");

        // Fallback to default values
        setLatestRelease({
          tag_name: "v0.0.8",
          name: "FoxyChat 0.0.8",
          body: "Latest version of FoxyChat with improved performance and new features.",
          published_at: "2025-01-01T00:00:00Z",
          assets: [],
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLatestRelease();
  }, []);

  // Helper functions
  const getVersionNumber = () => {
    if (!latestRelease) return "0.0.8";
    return latestRelease.tag_name.replace(/^v/, "");
  };

  const getFormattedDate = () => {
    if (!latestRelease) return "Loading...";
    try {
      return new Date(latestRelease.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Unknown date";
    }
  };

  const getDMGDownloadUrl = () => {
    if (!latestRelease?.assets) return null;

    const dmgAsset = latestRelease.assets.find(
      (asset) => asset.name.endsWith(".dmg") && asset.name.includes("arm64"),
    );

    return dmgAsset?.browser_download_url || null;
  };

  const getDMGSize = () => {
    if (!latestRelease?.assets) return "Unknown";

    const dmgAsset = latestRelease.assets.find(
      (asset) => asset.name.endsWith(".dmg") && asset.name.includes("arm64"),
    );

    if (!dmgAsset?.size) return "Unknown";

    // Convert bytes to MB
    const sizeInMB = (dmgAsset.size / (1024 * 1024)).toFixed(1);
    return `${sizeInMB} MB`;
  };

  const currentVersion = getVersionNumber();
  const releaseDate = getFormattedDate();

  const showComingSoonToast = (platform?: string) => {
    toast({
      title: "🚀 Coming Soon!",
      description: platform
        ? `${platform} is currently in development and will be available soon. Stay tuned for updates!`
        : "This feature is currently in development and will be available soon. Stay tuned for updates!",
      duration: 3000,
    });
  };

  const showDownloadToast = (platform: string) => {
    toast({
      title: "📥 Download Started!",
      description: `Your ${platform} download has started. Please check your Downloads folder.`,
      duration: 3000,
    });
  };

  const downloadOptions = [
    {
      platform: "macOS",
      icon: <Apple className="h-8 w-8" />,
      version: "macOS 12+",
      size: getDMGSize(),
      type: "DMG Package",
      downloadUrl: getDMGDownloadUrl(),
      recommended: true,
      architecture: "Universal (Intel & Apple Silicon)",
      minRequirements: "macOS Monterey 12.0 or later",
      available: !!getDMGDownloadUrl(),
    },
    {
      platform: "Windows",
      icon: <Monitor className="h-8 w-8" />,
      version: "Windows 10+",
      size: "95 MB",
      type: "MSI Installer",
      downloadUrl: "/FoxyChat-0.0.8-win64.msi",
      recommended: false,
      architecture: "x64",
      minRequirements: "Windows 10 version 1903 or later",
      comingSoon: true,
    },
    {
      platform: "Linux",
      icon: <Monitor className="h-8 w-8" />,
      version: "Ubuntu 20.04+",
      size: "89 MB",
      type: "AppImage",
      downloadUrl: "/FoxyChat-0.0.8-linux.AppImage",
      recommended: false,
      architecture: "x64",
      minRequirements: "Ubuntu 20.04, Debian 11, or equivalent",
      comingSoon: true,
    },
  ];

  const getReleaseNotes = () => {
    if (!latestRelease?.body) {
      return [
        "🎉 Initial public release of Foxychat",
        "🤖 Integrated with Model Context Protocol (MCP)",
        "💬 Natural language desktop automation",
        "🔧 Support for popular productivity apps",
        "🎨 Modern, intuitive user interface",
        "🔒 Privacy-focused local processing",
      ];
    }

    // Parse GitHub release body into bullet points
    const lines = latestRelease.body
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.trim());

    // Look for lines that start with - or * or are numbered
    const bulletPoints = lines.filter(
      (line) =>
        line.match(/^[-*]\s/) ||
        line.match(/^\d+\.\s/) ||
        line.match(/^[🎉🤖💬🔧🎨🔒⚡🚀✨🐛🛠️📝]/u),
    );

    if (bulletPoints.length > 0) {
      return bulletPoints.slice(0, 6); // Limit to 6 items
    }

    // If no bullet points found, split by periods and use as features
    const sentences = latestRelease.body
      .split(/[.!]/)
      .filter((sentence) => sentence.trim().length > 10)
      .slice(0, 6)
      .map((sentence) => `✨ ${sentence.trim()}`);

    return sentences.length > 0
      ? sentences
      : [
          "📦 Latest version with improvements and bug fixes",
          "🔧 Enhanced performance and stability",
          "🎨 UI/UX improvements",
        ];
  };

  const releaseNotes = getReleaseNotes();

  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Lightning Fast",
      description: "Optimized performance for instant responses",
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Privacy First",
      description: "Your data stays on your device",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Community Driven",
      description: "Open source with active community support",
    },
    {
      icon: <Star className="h-5 w-5" />,
      title: "AI Powered",
      description: "Advanced AI capabilities with MCP integration",
    },
  ];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative w-full overflow-hidden py-20 pt-28 md:py-28 md:pt-36"
        data-section="hero"
      >
        {/* Enhanced background with gradient and patterns */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50"></div>

        {/* Geometric background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_25%_25%,rgba(59,130,246,0.1)_0%,transparent_50%),radial-gradient(circle_at_75%_75%,rgba(147,51,234,0.1)_0%,transparent_50%)]"></div>
        </div>

        {/* Floating geometric shapes */}
        <div
          className="animate-float absolute top-10 left-10 h-20 w-20 rounded-lg bg-blue-200/30 blur-sm"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="animate-float absolute top-32 right-20 h-16 w-16 rounded-full bg-purple-200/30 blur-sm"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="animate-float absolute bottom-40 left-20 h-12 w-12 rounded-lg bg-indigo-200/30 blur-sm"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="animate-float absolute right-32 bottom-20 h-24 w-24 rounded-full bg-pink-200/30 blur-sm"
          style={{ animationDelay: "0.5s" }}
        ></div>

        {/* Rotating elements */}
        <div
          className="animate-rotate absolute top-1/4 left-1/4 h-32 w-32 rounded-full border border-blue-200/40"
          style={{ animationDuration: "25s" }}
        ></div>
        <div
          className="animate-rotate absolute right-1/4 bottom-1/3 h-40 w-40 rounded-lg border border-purple-200/40"
          style={{ animationDuration: "30s" }}
        ></div>

        {/* Enhanced animated blobs */}
        <div className="animate-pulse-slow absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl"></div>
        <div
          className="animate-pulse-slow absolute right-1/4 bottom-1/3 h-48 w-48 rounded-full bg-gradient-to-r from-purple-400/20 to-pink-400/20 blur-2xl"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="animate-pulse-slow absolute top-1/2 left-1/6 h-24 w-24 rounded-full bg-gradient-to-r from-indigo-400/15 to-blue-400/15 blur-lg"
          style={{ animationDelay: "1s" }}
        ></div>

        {/* Particle-like dots */}
        <div
          className="animate-float absolute top-20 left-1/3 h-2 w-2 rounded-full bg-blue-400/60"
          style={{ animationDelay: "0.5s" }}
        ></div>
        <div
          className="animate-float absolute top-40 right-1/3 h-1 w-1 rounded-full bg-purple-400/60"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="animate-float absolute bottom-32 left-1/2 h-3 w-3 rounded-full bg-indigo-400/60"
          style={{ animationDelay: "2.5s" }}
        ></div>
        <div
          className="animate-float absolute right-1/5 bottom-60 h-2 w-2 rounded-full bg-pink-400/60"
          style={{ animationDelay: "3s" }}
        ></div>
        <div
          className="animate-float absolute top-60 left-1/5 h-1 w-1 rounded-full bg-blue-500/60"
          style={{ animationDelay: "1.2s" }}
        ></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

        <div className="relative z-10 container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div
            className={`space-y-8 text-center transition-all duration-1000 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <div className="space-y-4">
              <h1
                className={`text-4xl font-bold tracking-tight text-gray-800 md:text-5xl lg:text-6xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
              >
                Download{" "}
                <span className="from-primary to-accent bg-gradient-to-r bg-clip-text text-transparent">
                  Foxychat
                </span>
              </h1>
              <p
                className={`text-muted-foreground mx-auto max-w-3xl text-lg leading-relaxed md:text-xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                Your personal AI desktop companion that understands your workflow and automates
                repetitive tasks intelligently.
              </p>
            </div>

            <div
              className={`flex flex-wrap items-center justify-center gap-4 pt-4 transition-all delay-300 duration-1000 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
            >
              <Badge
                variant="outline"
                className="border-primary/20 bg-white/50 px-4 py-2 text-base text-gray-700 backdrop-blur-sm"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Star className="text-primary mr-2 h-4 w-4" />
                )}
                v{currentVersion}
              </Badge>
              <Badge
                variant="outline"
                className="border-primary/20 bg-white/50 px-4 py-2 text-base text-gray-700 backdrop-blur-sm"
              >
                <Clock className="text-primary mr-2 h-4 w-4" />
                {releaseDate}
              </Badge>
              {error && (
                <Badge
                  variant="outline"
                  className="border-destructive/20 bg-destructive/10 text-destructive px-4 py-2 text-base backdrop-blur-sm"
                >
                  ⚠️ Using fallback data
                </Badge>
              )}
            </div>

            {/* Quick features */}
            <div
              className={`mx-auto grid max-w-4xl grid-cols-2 gap-4 pt-8 transition-all delay-500 duration-1000 md:grid-cols-4 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
            >
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-gray-200/50 bg-white/50 p-4 text-center backdrop-blur-sm transition-all hover:shadow-lg"
                >
                  <div className="text-primary flex justify-center">{feature.icon}</div>
                  <h3 className="text-sm font-semibold text-gray-800">{feature.title}</h3>
                  <p className="text-muted-foreground text-xs">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Download Options */}
      <section className="w-full py-16 md:py-20">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Choose Your Platform</h2>
            <p className="text-muted-foreground mx-auto max-w-2xl text-lg md:text-xl">
              Download Foxychat for your operating system and start automating your workflow today.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {downloadOptions.map((option, index) => (
              <Card
                key={index}
                className={`group relative transition-all duration-300 hover:shadow-xl ${
                  option.recommended
                    ? "border-primary/30 scale-105 border-2 shadow-lg"
                    : "border-border hover:border-primary/20 border"
                } ${option.comingSoon ? "opacity-75" : ""}`}
              >
                {option.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                    <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1">
                      Recommended
                    </Badge>
                  </div>
                )}

                {option.comingSoon && (
                  <div className="absolute -top-3 right-4">
                    <Badge
                      variant="outline"
                      className="bg-accent/5 border-accent/20 text-accent px-3 py-1"
                    >
                      Coming Soon
                    </Badge>
                  </div>
                )}

                <CardHeader className="pt-8 pb-4 text-center">
                  <div
                    className={`mb-4 flex justify-center ${option.recommended ? "text-primary" : "text-muted-foreground group-hover:text-primary"} transition-colors`}
                  >
                    {option.icon}
                  </div>
                  <CardTitle className="text-2xl font-bold">{option.platform}</CardTitle>
                  <p className="text-muted-foreground">{option.version}</p>
                </CardHeader>

                <CardContent className="space-y-6 pb-8">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Package Size:</span>
                      <span className="font-medium">{option.size}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Format:</span>
                      <span className="font-medium">{option.type}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Architecture:</span>
                      <span className="font-medium">{option.architecture}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="text-muted-foreground text-xs">
                    <span className="font-medium">Requirements:</span> {option.minRequirements}
                  </div>

                  <Button
                    className={`w-full shadow-md transition-all duration-300 hover:shadow-lg ${
                      option.recommended
                        ? "from-primary to-accent hover:from-primary/90 hover:to-accent/90 bg-linear-to-r"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                    size="lg"
                    disabled={option.comingSoon}
                    onClick={() => {
                      if (!option.comingSoon && option.downloadUrl && option.available) {
                        // Direct download from GitHub releases
                        window.open(option.downloadUrl, "_blank");
                        showDownloadToast(option.platform);
                      } else if (!option.available && option.platform === "macOS") {
                        toast({
                          title: "⚠️ Download Unavailable",
                          description:
                            "The latest release is still being processed. Please try again in a few minutes.",
                          duration: 5000,
                        });
                      } else {
                        showComingSoonToast(option.platform);
                      }
                    }}
                  >
                    {option.comingSoon ? (
                      <>
                        <Clock className="mr-2 h-4 w-4" />
                        Coming Soon
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="mr-2 h-4 w-4" />
                        Download for {option.platform}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Alternative Download Options */}
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">Looking for other options?</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5"
                onClick={() =>
                  window.open("https://github.com/CodeFox-Repo/homebrew-codefox/releases", "_blank")
                }
              >
                <Github className="mr-2 h-4 w-4" />
                View All Releases
              </Button>
              <Button
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => showComingSoonToast("Web Version")}
              >
                <Globe className="mr-2 h-4 w-4" />
                Web Version (Beta)
              </Button>
              <Button
                variant="outline"
                className="border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => showComingSoonToast("Mobile App")}
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Mobile App (Coming Soon)
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Release Notes & Additional Info */}
      <section className="from-muted/20 to-background w-full bg-linear-to-b py-16 md:py-20">
        <div className="container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Release Notes */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <FileText className="text-primary h-5 w-5" />
                  What's New in v{currentVersion}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="mb-8 space-y-4">
                  {releaseNotes.map((note, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                      <span className="text-sm leading-relaxed">{note}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="border-primary/20 text-primary hover:bg-primary/5 w-full"
                    onClick={() =>
                      window.open(
                        `https://github.com/CodeFox-Repo/homebrew-codefox/releases/tag/${latestRelease?.tag_name || "latest"}`,
                        "_blank",
                      )
                    }
                  >
                    View Full Changelog
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground hover:bg-muted/20 w-full"
                    onClick={() => showComingSoonToast("Previous Versions")}
                  >
                    Previous Versions
                    <HardDrive className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Installation & Support */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <Zap className="text-primary h-5 w-5" />
                  Quick Start Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      <span className="text-primary text-xs font-semibold">1</span>
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-medium">Download & Install</h4>
                      <p className="text-muted-foreground text-xs">
                        Choose your platform and download the installer
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      <span className="text-primary text-xs font-semibold">2</span>
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-medium">Launch Application</h4>
                      <p className="text-muted-foreground text-xs">
                        Open Foxychat and complete the initial setup
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      <span className="text-primary text-xs font-semibold">3</span>
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-medium">Start Automating</h4>
                      <p className="text-muted-foreground text-xs">
                        Begin using AI-powered desktop automation
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 text-base font-semibold">
                    <Users className="text-primary h-4 w-4" />
                    Need Help?
                  </h4>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-accent/20 text-accent hover:bg-accent/5 w-full justify-start"
                      onClick={() => window.open("https://docs.foxychat.net/docs", "_blank")}
                    >
                      <FileText className="mr-2 h-3 w-3" />
                      View Documentation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary/20 text-primary hover:bg-primary/5 w-full justify-start"
                      onClick={() => showComingSoonToast("Community Forum")}
                    >
                      <Users className="mr-2 h-3 w-3" />
                      Join Community
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-accent/20 text-accent hover:bg-accent/5 w-full justify-start"
                      onClick={() => showComingSoonToast("Issue Reporting")}
                    >
                      <Github className="mr-2 h-3 w-3" />
                      Report Issues
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Download;
