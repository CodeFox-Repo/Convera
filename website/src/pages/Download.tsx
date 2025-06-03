import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Apple,
  CheckCircle,
  Cpu,
  Download as DownloadIcon,
  ExternalLink,
  Shield,
  Zap
} from "lucide-react";

const Download = () => {
  const currentVersion = "0.0.8";
  const releaseDate = "June 1, 2025";

  const downloadOptions = [
    {
      platform: "macOS",
      icon: <Apple className="h-6 w-6" />,
      version: "macOS 12+",
      size: "102 MB",
      type: "DMG Package",
      downloadUrl: "/FoxyChat-0.0.8-arm64.dmg",
      recommended: true,
    },
  ];

  const systemRequirements = {
    recommended: [
      "Mac OS",
      "Apple Silicon or Intel Chip",
    ],
  };

  const releaseNotes = [
    "Initial Release",
  ];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />

      {/* Header Section */}
      <section className="relative w-full overflow-hidden bg-gradient-to-br from-white via-orange-50/30 to-orange-100/50 py-12 md:py-16">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-200/10 to-transparent"></div>
        
        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8 max-w-5xl">

          <div className="text-center space-y-6">
            <div className="space-y-3">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                Download{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-orange-400">
                  Foxychat
                </span>
              </h1>
              <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
                Get the latest version of your AI desktop companion
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 pt-2">
              <Badge variant="outline" className="bg-white/80 border-orange-200 text-orange-700 px-3 py-1">
                v{currentVersion}
              </Badge>
              <Badge variant="outline" className="bg-white/80 border-orange-200 text-orange-700 px-3 py-1">
                {releaseDate}
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Download Options */}
      <section className="w-full py-12 md:py-16">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-semibold mb-3">Choose Your Platform</h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
              Download Foxychat for your operating system
            </p>
          </div>

          <div className="flex justify-center mb-10">
            <div className="w-full max-w-sm">
              {downloadOptions.map((option, index) => (
                <Card key={index} className={`relative transition-all duration-300 hover:shadow-xl border-2 ${
                  option.recommended ? 'border-orange-200 shadow-lg' : 'border-gray-200'
                }`}>
                  {option.recommended && (
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1">
                        Recommended
                      </Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pb-3 pt-6">
                    <div className="flex justify-center text-orange-500 mb-3">
                      {option.icon}
                    </div>
                    <CardTitle className="text-xl font-semibold">{option.platform}</CardTitle>
                    <p className="text-muted-foreground text-sm">{option.version}</p>
                  </CardHeader>
                  
                  <CardContent className="space-y-4 pb-6">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground bg-gray-50 rounded-full px-3 py-1 inline-block">
                        {option.type} • {option.size}
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 transition-all duration-300 shadow-md hover:shadow-lg"
                      size="lg"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = option.downloadUrl;
                        link.download = '';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <DownloadIcon className="h-4 w-4 mr-2" />
                      Download for {option.platform}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* System Requirements & Release Notes */}
      <section className="w-full py-12 md:py-16 bg-gray-50/50">
        <div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Requirements */}
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Cpu className="h-4 w-4 text-orange-500" />
                  System Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">                
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                    <Zap className="h-3 w-3 text-orange-500" />
                    Recommended Requirements
                  </h4>
                  <ul className="space-y-2">
                    {systemRequirements.recommended.map((req, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Release Notes */}
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-4 w-4 text-orange-500" />
                  What's New in v{currentVersion}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {releaseNotes.map((note, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle className="h-3 w-3 text-orange-500 flex-shrink-0 mt-1" />
                      <span className="text-sm">{note}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="pt-4 border-t">
                  <Button variant="outline" className="w-full text-sm border-orange-200 text-orange-600 hover:bg-orange-50">
                    View Full Changelog
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-white">
        <div className="container mx-auto max-w-4xl px-4 md:px-6">
          <div className="text-muted-foreground text-center">
            <p className="text-sm">&copy; 2025 Foxychat. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Download; 