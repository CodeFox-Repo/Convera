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
  Zap
} from "lucide-react";

const Download = () => {
  const { toast } = useToast();
  const currentVersion = "0.0.8";
  const releaseDate = "June 1, 2025";

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
      size: "102 MB",
      type: "DMG Package",
      downloadUrl: "/FoxyChat-0.0.8-arm64.dmg",
      recommended: true,
      architecture: "Universal (Intel & Apple Silicon)",
      minRequirements: "macOS Monterey 12.0 or later",
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

  const releaseNotes = [
    "🎉 Initial public release of Foxychat",
    "🤖 Integrated with Model Context Protocol (MCP)",
    "💬 Natural language desktop automation",
    "🔧 Support for popular productivity apps",
    "🎨 Modern, intuitive user interface",
    "🔒 Privacy-focused local processing",
  ];

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
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-white via-orange-50/40 to-orange-100/60 py-16 md:py-24 pt-24 md:pt-32">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-200/20 to-transparent"></div>
        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-orange-100/30 to-transparent"></div>
        
        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                Download{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-orange-400">
                  Foxychat
                </span>
              </h1>
              <p className="text-muted-foreground text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed">
                Your personal AI desktop companion that understands your workflow and automates repetitive tasks intelligently.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Badge variant="outline" className="bg-white/90 border-orange-200 text-orange-700 px-4 py-2 text-base">
                <Star className="h-4 w-4 mr-2" />
                v{currentVersion}
              </Badge>
              <Badge variant="outline" className="bg-white/90 border-orange-200 text-orange-700 px-4 py-2 text-base">
                <Clock className="h-4 w-4 mr-2" />
                {releaseDate}
              </Badge>
 
            </div>

            {/* Quick features */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 max-w-4xl mx-auto">
              {features.map((feature, index) => (
                <div key={index} className="text-center space-y-2 p-4 rounded-lg bg-white/60 backdrop-blur-sm border border-orange-100/50">
                  <div className="flex justify-center text-orange-500">
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
                option.recommended ? 'border-2 border-orange-200 shadow-lg scale-105' : 'border border-gray-200 hover:border-orange-200'
              } ${option.comingSoon ? 'opacity-75' : ''}`}>
                {option.recommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1">
                      Recommended
                    </Badge>
                  </div>
                )}
                
                {option.comingSoon && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 px-3 py-1">
                      Coming Soon
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4 pt-8">
                  <div className={`flex justify-center mb-4 ${option.recommended ? 'text-orange-500' : 'text-gray-500 group-hover:text-orange-500'} transition-colors`}>
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
                        ? 'bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500' 
                        : 'bg-gray-600 hover:bg-gray-700'
                    }`}
                    size="lg"
                    disabled={option.comingSoon}
                    onClick={() => {
                      if (!option.comingSoon) {
                        const link = document.createElement('a');
                        link.href = option.downloadUrl;
                        link.download = '';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        showDownloadToast(option.platform);
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
                className="border-orange-200 text-orange-600 hover:bg-orange-50"
                onClick={() => showComingSoonToast("GitHub Repository")}
              >
                <Github className="h-4 w-4 mr-2" />
                View on GitHub
              </Button>
              <Button 
                variant="outline" 
                className="border-orange-200 text-orange-600 hover:bg-orange-50"
                onClick={() => showComingSoonToast("Web Version")}
              >
                <Globe className="h-4 w-4 mr-2" />
                Web Version (Beta)
              </Button>
              <Button 
                variant="outline" 
                className="border-orange-200 text-orange-600 hover:bg-orange-50"
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
      <section className="w-full py-16 md:py-20 bg-gradient-to-b from-gray-50/50 to-white">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Release Notes */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <FileText className="h-5 w-5 text-orange-500" />
                  What's New in v{currentVersion}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4 mb-8">
                  {releaseNotes.map((note, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{note}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full border-orange-200 text-orange-600 hover:bg-orange-50"
                    onClick={() => showComingSoonToast("Full Changelog")}
                  >
                    View Full Changelog
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full border-gray-200 text-gray-600 hover:bg-gray-50"
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
                  <Zap className="h-5 w-5 text-orange-500" />
                  Quick Start Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-orange-100 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-orange-600 text-xs font-semibold">1</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Download & Install</h4>
                      <p className="text-xs text-muted-foreground">Choose your platform and download the installer</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-orange-100 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-orange-600 text-xs font-semibold">2</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Launch Application</h4>
                      <p className="text-xs text-muted-foreground">Open Foxychat and complete the initial setup</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="bg-orange-100 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-orange-600 text-xs font-semibold">3</span>
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
                    <Users className="h-4 w-4 text-orange-500" />
                    Need Help?
                  </h4>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => window.open('https://docs.foxychat.net/docs', '_blank')}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      View Documentation
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-green-200 text-green-600 hover:bg-green-50"
                      onClick={() => showComingSoonToast("Community Forum")}
                    >
                      <Users className="h-3 w-3 mr-2" />
                      Join Community
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start border-purple-200 text-purple-600 hover:bg-purple-50"
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