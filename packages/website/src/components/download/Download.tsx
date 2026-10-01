import { getReleaseSummary, RELEASES_URL, type GitHubRelease } from "@/lib/release-info";
import SimpleBackground from "@/components/SimpleBackground";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Apple,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Github,
  HardDrive,
  Loader2,
  Monitor,
  Shield,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

  const fetchLatestRelease = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLatestRelease(null);
    try {
      const response = await fetch(
        `${RELEASES_URL.replace("github.com/", "api.github.com/repos/")}/latest`,
        {
          headers: { Accept: "application/vnd.github.v3+json" },
        },
      );
      if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
      const release: GitHubRelease = await response.json();
      if (!release.tag_name || !Array.isArray(release.assets)) {
        throw new Error("Incomplete release information");
      }
      setLatestRelease(release);
    } catch (err) {
      console.error("Failed to fetch latest release:", err);
      setError("Couldn’t load the latest release. Try again or view releases on GitHub.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLatestRelease();
  }, [fetchLatestRelease]);

  const release = getReleaseSummary(latestRelease);
  const currentVersion = release.version;
  const releaseDate = release.date;
  const getDMGDownloadUrl = () => release.dmgUrl;
  const getDMGSize = () => release.dmgSize;

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText("brew install --cask codefox-repo/codefox/convera");
      toast({
        title: "Install command copied",
        description: "Review it, then paste it into Terminal to install.",
        duration: 2500,
      });
    } catch {
      toast({
        title: "Couldn’t copy the command",
        description: "Select the command and copy it manually.",
        variant: "destructive",
      });
    }
  };

  // macOS is not a card here: brew install is the front door (its own
  // section up top) and the raw DMG is the fallback at the bottom.
  const downloadOptions = [
    // No fabricated sizes or URLs on unshipped platforms: the agent
    // sandbox's OS enforcement (ASRT) only covers macOS today, and these
    // ship when that does.
    {
      platform: "Windows",
      icon: <Monitor className="h-8 w-8" />,
      version: "No release available",
      size: "—",
      type: "TBD",
      downloadUrl: null,
      recommended: false,
      architecture: "Not confirmed",
      minRequirements: "Not confirmed",
      comingSoon: true,
    },
    {
      platform: "Linux",
      icon: <Monitor className="h-8 w-8" />,
      version: "No release available",
      size: "—",
      type: "TBD",
      downloadUrl: null,
      recommended: false,
      architecture: "Not confirmed",
      minRequirements: "Not confirmed",
      comingSoon: true,
    },
  ];

  const releaseNotes = release.notes;

  const features = [
    {
      icon: <Zap className="h-5 w-5" />,
      title: "Choose your provider",
      description: "AI replies require a configured provider",
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: "Local history",
      description: "AI requests go to your chosen provider",
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Open source",
      description: "Browse the code and report issues on GitHub",
    },
    {
      icon: <Star className="h-5 w-5" />,
      title: "Connect tools",
      description: "Add compatible MCP servers in settings",
    },
  ];

  return (
    <div className="bg-background flex min-h-screen flex-col">
      {/* Hero Section */}
      <section
        className="relative w-full overflow-hidden py-20 pt-28 md:py-28 md:pt-36"
        data-section="hero"
      >
        <SimpleBackground />

        <div className="relative z-10 container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div
            className={`space-y-8 text-center transition-all duration-1000 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
          >
            <div className="space-y-4">
              <h1
                className={`gradient-orange-text text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
              >
                Download <span className="gradient-orange-text">Convera</span>
              </h1>
              <p
                className={`text-secondary mx-auto max-w-3xl text-lg leading-relaxed md:text-xl ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
              >
                Try the macOS beta on Apple Silicon. Configure an AI provider to start chatting.
                Provider accounts and usage charges are separate.
              </p>
            </div>

            <div
              className={`flex flex-wrap items-center justify-center gap-4 pt-4 transition-all delay-300 duration-1000 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
            >
              <Badge
                variant="outline"
                className="border-orange bg-card text-orange-primary px-4 py-2 text-base backdrop-blur-sm"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Star className="text-orange-primary mr-2 h-4 w-4" />
                )}
                {isLoading
                  ? "Checking latest version…"
                  : currentVersion
                    ? `v${currentVersion}`
                    : "Version unavailable"}
              </Badge>
              <Badge
                variant="outline"
                className="border-orange bg-card text-orange-primary px-4 py-2 text-base backdrop-blur-sm"
              >
                <Clock className="text-orange-primary mr-2 h-4 w-4" />
                {isLoading ? "Loading release date…" : (releaseDate ?? "Release date unavailable")}
              </Badge>
              {error && (
                <div role="alert" className="text-destructive w-full text-sm">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => void fetchLatestRelease()}
                    disabled={isLoading}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>

            {/* Quick features */}
            <div
              className={`mx-auto grid max-w-4xl grid-cols-2 gap-4 pt-8 transition-all delay-500 duration-1000 md:grid-cols-4 ${isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"}`}
            >
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="border-orange bg-card hover:bg-orange-subtle space-y-2 rounded-lg border p-4 text-center backdrop-blur-sm transition-all hover:shadow-lg"
                >
                  <div className="text-orange-primary flex justify-center">{feature.icon}</div>
                  <h3 className="text-primary text-sm font-semibold">{feature.title}</h3>
                  <p className="text-secondary text-xs">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Install via Homebrew — the one true path */}
      <section className="relative w-full py-16 md:py-20">
        <SimpleBackground />
        <div className="relative z-10 container mx-auto max-w-3xl px-4 md:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="gradient-orange-text mb-4 text-3xl font-bold md:text-4xl">
              Install with Homebrew
            </h2>
            <p className="text-secondary mx-auto max-w-2xl text-lg">
              Run this command if you use Homebrew. Review the release and installation instructions
              before installing this beta.
            </p>
          </div>
          <button
            type="button"
            className="border-primary/30 bg-card hover:border-primary/60 mx-auto block w-full max-w-xl overflow-x-auto rounded-xl border-2 px-6 py-5 text-center font-mono text-sm shadow-lg transition-all hover:shadow-xl md:text-base"
            title="Copy Homebrew install command"
            aria-label="Copy Homebrew install command"
            onClick={() => void copyInstallCommand()}
          >
            brew install --cask codefox-repo/codefox/convera
          </button>
          <p className="text-muted-foreground mt-3 text-center text-xs">
            Copy install command · Apple Silicon · macOS 12+
          </p>
        </div>
      </section>

      {/* Download Options */}
      <section className="relative w-full py-16 md:py-20">
        <SimpleBackground />
        <div className="relative z-10 container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="gradient-orange-text mb-4 text-3xl font-bold md:text-4xl">
              Other Platforms
            </h2>
            <p className="text-secondary mx-auto max-w-2xl text-lg md:text-xl">
              Windows and Linux downloads are not available. No release date is confirmed.
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
                      Not available
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
                    className="text-foreground bg-muted hover:bg-muted/80 w-full shadow-md transition-all duration-300 hover:shadow-lg"
                    size="lg"
                    disabled={option.comingSoon}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Not available
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Direct DMG — the fallback path, deliberately below the fold */}
          <div className="mt-12 text-center">
            <p className="text-secondary mb-4">
              Prefer a direct download? Review the release notes and macOS installation guidance
              before opening the DMG.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                variant="outline"
                className="border-orange text-orange-primary hover:bg-orange-subtle"
                disabled={!getDMGDownloadUrl()}
                onClick={() => {
                  const url = getDMGDownloadUrl();
                  if (url) window.open(url, "_blank");
                }}
              >
                <Apple className="mr-2 h-4 w-4" />
                {getDMGDownloadUrl()
                  ? `Download macOS DMG (${getDMGSize()})`
                  : isLoading
                    ? "Checking for macOS DMG…"
                    : "macOS DMG unavailable"}
              </Button>
              <Button
                variant="outline"
                className="border-orange text-orange-primary hover:bg-orange-subtle"
                onClick={() =>
                  window.open("https://github.com/CodeFox-Repo/Convera/releases", "_blank")
                }
              >
                <Github className="mr-2 h-4 w-4" />
                View All Releases
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Release Notes & Additional Info */}
      <section className="relative w-full py-16 md:py-20">
        <SimpleBackground />
        <div className="container mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Release Notes */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-6">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <FileText className="text-primary h-5 w-5" />
                  Release notes{currentVersion ? ` · v${currentVersion}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {releaseNotes.length === 0 && (
                  <p className="text-muted-foreground mb-8 text-sm">
                    {isLoading
                      ? "Loading release notes…"
                      : "Release notes are unavailable here. View releases on GitHub for details."}
                  </p>
                )}
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
                    onClick={() => window.open(release.url, "_blank")}
                  >
                    View Full Changelog
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="border-border text-muted-foreground hover:bg-muted/20 w-full"
                    onClick={() => window.open(RELEASES_URL, "_blank", "noopener,noreferrer")}
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
                      <h4 className="mb-1 text-sm font-medium">Install with Homebrew</h4>
                      <p className="text-muted-foreground text-xs">
                        Requires Homebrew. Review the command and the release before installing.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      <span className="text-primary text-xs font-semibold">2</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="mb-1 text-sm font-medium">Downloaded the DMG instead?</h4>
                      <p className="text-muted-foreground mb-2 text-xs">
                        macOS may block this beta because it is not notarized. Verify the download
                        came from this repository. The command below removes macOS quarantine checks
                        for this app; use it only if you trust the download:
                      </p>
                      <code className="bg-well border-rule block overflow-x-auto rounded-md border px-2.5 py-1.5 font-mono text-[11px]">
                        sudo xattr -rd com.apple.quarantine /Applications/Convera.app
                      </code>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                      <span className="text-primary text-xs font-semibold">3</span>
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-medium">Choose an AI provider</h4>
                      <p className="text-muted-foreground text-xs">
                        Open Settings → General to check providers. Configure the provider used by
                        your colleagues before sending a message.
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
                      className="border-primary/20 text-primary hover:bg-primary/5 w-full justify-start"
                      onClick={() =>
                        window.open(
                          "https://github.com/CodeFox-Repo/Convera",
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <Users className="mr-2 h-3 w-3" />
                      View GitHub repository
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-accent/20 text-accent hover:bg-accent/5 w-full justify-start"
                      onClick={() =>
                        window.open(
                          "https://github.com/CodeFox-Repo/Convera/issues",
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <Github className="mr-2 h-3 w-3" />
                      Report an issue
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Download;
