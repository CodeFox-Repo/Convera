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
  Monitor,
  Shield,
  Smartphone,
  Star,
  Users,
  Zap,
  Loader2
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

  // Fetch latest release from homebrew-codefox repository
  useEffect(() => {
    const fetchLatestRelease = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(
          'https://api.github.com/repos/CodeFox-Repo/homebrew-codefox/releases/latest',
          {
            headers: {
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const release: GitHubRelease = await response.json();
        setLatestRelease(release);
      } catch (err) {
        console.error('Failed to fetch latest release:', err);
        setError('Failed to load latest version information');
        
        // Fallback to default values
        setLatestRelease({
          tag_name: 'v0.0.8',
          name: 'FoxyChat 0.0.8',
          body: 'Latest version of FoxyChat with improved performance and new features.',
          published_at: '2025-01-01T00:00:00Z',
          assets: []
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
    return latestRelease.tag_name.replace(/^v/, '');
  };

  const getFormattedDate = () => {
    if (!latestRelease) return "Loading...";
    try {
      return new Date(latestRelease.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return "Unknown date";
    }
  };

  const getDMGDownloadUrl = () => {
    if (!latestRelease?.assets) return null;
    
    const dmgAsset = latestRelease.assets.find(asset => 
      asset.name.endsWith('.dmg') && asset.name.includes('arm64')
    );
    
    return dmgAsset?.browser_download_url || null;
  };

  const getDMGSize = () => {
    if (!latestRelease?.assets) return "Unknown";
    
    const dmgAsset = latestRelease.assets.find(asset => 
      asset.name.endsWith('.dmg') && asset.name.includes('arm64')
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
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.trim());

    // Look for lines that start with - or * or are numbered
    const bulletPoints = lines.filter(line => 
      line.match(/^[-*]\s/) || 
      line.match(/^\d+\.\s/) ||
      line.match(/^[🎉🤖💬🔧🎨🔒⚡🚀✨🐛🛠️📝]/u));

    if (bulletPoints.length > 0) {
      return bulletPoints.slice(0, 6); // Limit to 6 items
    }

    // If no bullet points found, split by periods and use as features
    const sentences = latestRelease.body
      .split(/[.!]/)
      .filter(sentence => sentence.trim().length > 10)
      .slice(0, 6)
      .map(sentence => `✨ ${sentence.trim()}`);

    return sentences.length > 0 ? sentences : [
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
      description: "Optimized performance for instant responses"
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Privacy First",
      description: "Your data stays on your device"
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Community Driven",
      description: "Open source with active community support"
    },
    {
      icon: <Star className="h-5 w-5" />,
      title: "AI Powered",
      description: "Advanced AI capabilities with MCP integration"
    },
  ];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-linear-to-br from-background via-primary/5 to-primary/10 py-16 md:py-24 pt-24 md:pt-32">
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-primary/20 to-transparent"></div>
        <div className="absolute top-0 right-0 h-full w-1/3 bg-linear-to-l from-primary/30 to-transparent"></div>
        
        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Download{" "}
                <span className="bg-clip-text text-transparent bg-linear-to-r from-primary to-accent">
                  Foxychat
                </span>
              </h1>
              <p className="text-muted-foreground text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed">
                Your personal AI desktop companion that understands your workflow and automates repetitive tasks intelligently.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Badge variant="outline" className="bg-card border-primary/20 text-primary px-4 py-2 text-base">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Star className="h-4 w-4 mr-2" />
                )}
                v{currentVersion}
              </Badge>
              <Badge variant="outline" className="bg-card border-primary/20 text-primary px-4 py-2 text-base">
                <Clock className="h-4 w-4 mr-2" />
                {releaseDate}
              </Badge>
              {error && (
                <Badge variant="outline" className="bg-destructive/5 border-destructive/20 text-destructive px-4 py-2 text-base">
                  ⚠️ Using fallback data
                </Badge>
              )}
            </div>

            {/* Quick features */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 max-w-4xl mx-auto">
              {features.map((feature, index) => (
                <div key={index} className="text-center space-y-2 p-4 rounded-lg bg-card/60 backdrop-blur-sm border border-primary/20">
                  <div className="flex justify-center text-primary">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-sm">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Download Options */}
      <section className="w-full py-16 md:py-20">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Choose Your Platform</h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
              Download Foxychat for your operating system and start automating your workflow today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {downloadOptions.map((option, index) => (
              <Card key={index} className={`relative transition-all duration-300 hover:shadow-xl group ${
                option.recommended ? 'border-2 border-primary/30 shadow-lg scale-105' : 'border border-border hover:border-primary/20'
              } ${option.comingSoon ? 'opacity-75' : ''}`}>
                {option.recommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-1">
                      Recommended
                    </Badge>
                  </div>
                )}
                
                {option.comingSoon && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="outline" className="bg-accent/5 border-accent/20 text-accent px-3 py-1">
                      Coming Soon
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4 pt-8">
                  <div className={`flex justify-center mb-4 ${option.recommended ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'} transition-colors`}>
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
                  
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Requirements:</span> {option.minRequirements}
                  </div>
                  
                  <Button 
                    className={`w-full transition-all duration-300 shadow-md hover:shadow-lg ${
                      option.recommended 
                        ? 'bg-linear-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90' 
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                    size="lg"
                    disabled={option.comingSoon}
                    onClick={() => {
                      if (!option.comingSoon && option.downloadUrl && option.available) {
                        // Direct download from GitHub releases
                        window.open(option.downloadUrl, '_blank');
                        showDownloadToast(option.platform);
                      } else if (!option.available && option.platform === "macOS") {
                        toast({
                          title: "⚠️ Download Unavailable",
                          description: "The latest release is still being processed. Please try again in a few minutes.",
                          duration: 5000,
                        });
                      } else {
                        showComingSoonToast(option.platform);
                      }
                    }}
                  >
                    {option.comingSoon ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Coming Soon
                      </>
                    ) : (
                      <>
                        <DownloadIcon className="h-4 w-4 mr-2" />
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
                onClick={() => window.open('https://github.com/CodeFox-Repo/homebrew-codefox/releases', '_blank')}
              >
                <Github className="h-4 w-4 mr-2" />
                View All Releases
              </Button>
              <Button 
                variant="outline" 
                className="border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => showComingSoonToast("Web Version")}
              >
                <Globe className="h-4 w-4 mr-2" />
                Web Version (Beta)
              </Button>
              <Button 
                variant="outline" 
                className="border-primary/20 text-primary hover:bg-primary/5"
                onClick={() => showComingSoonToast("Mobile App")}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Mobile App (Coming Soon)
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Release Notes & Additional Info */}
      <section className="w-full py-16 md:py-20 bg-linear-to-b from-muted/20 to-background">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Release Notes */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <FileText className="h-5 w-5 text-primary" />
                  What's New in v{currentVersion}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8">
                  {releaseNotes.map((note, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{note}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full border-primary/20 text-primary hover:bg-primary/5"
                    onClick={() => window.open(`https://github.com/CodeFox-Repo/homebrew-codefox/releases/tag/${latestRelease?.tag_name || 'latest'}`, '_blank')}
                  >
                    View Full Changelog
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full border-border text-muted-foreground hover:bg-muted/20"
                    onClick={() => showComingSoonToast("Previous Versions")}
                  >
                    Previous Versions
                    <HardDrive className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Installation & Support */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <Zap className="h-5 w-5 text-primary" />
                  Quick Start Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs font-semibold">1</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Download & Install</h4>
                      <p className="text-xs text-muted-foreground">Choose your platform and download the installer</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs font-semibold">2</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Launch Application</h4>
                      <p className="text-xs text-muted-foreground">Open Foxychat and complete the initial setup</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-primary text-xs font-semibold">3</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Start Automating</h4>
                      <p className="text-xs text-muted-foreground">Begin using AI-powered desktop automation</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-semibold text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Need Help?
                  </h4>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-accent/20 text-accent hover:bg-accent/5"
                      onClick={() => window.open('https://docs.foxychat.net/docs', '_blank')}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      View Documentation
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-primary/20 text-primary hover:bg-primary/5"
                      onClick={() => showComingSoonToast("Community Forum")}
                    >
                      <Users className="h-3 w-3 mr-2" />
                      Join Community
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-accent/20 text-accent hover:bg-accent/5"
                      onClick={() => showComingSoonToast("Issue Reporting")}
                    >
                      <Github className="h-3 w-3 mr-2" />
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