import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const Footer = () => {
  const { toast } = useToast();

  const showComingSoonToast = (linkName: string) => {
    toast({
      title: "🚀 Coming Soon!",
      description: `${linkName} is currently under development and will be available soon. Stay tuned for updates!`,
      duration: 3000,
    });
  };

  const footerSections = [
    {
      title: "Support",
      links: [
        { name: "Documentation", href: "https://docs.foxychat.net/docs", external: true },
        { name: "Community Forum", comingSoon: true },
        { name: "Bug Reports", comingSoon: true },
        { name: "Feature Requests", comingSoon: true },
      ]
    },
    {
      title: "Resources",
      links: [
        { name: "Getting Started", comingSoon: true },
        { name: "API Reference", comingSoon: true },
        { name: "MCP Guide", comingSoon: true },
        { name: "Examples", comingSoon: true },
      ]
    },
    {
      title: "Company",
      links: [
        { name: "About Us", comingSoon: true },
        { name: "Privacy Policy", comingSoon: true },
        { name: "Terms of Service", comingSoon: true },
        { name: "Contact", comingSoon: true },
      ]
    }
  ];

  const handleLinkClick = (link: { name: string; href?: string; external?: boolean; comingSoon?: boolean }) => {
    if (link.comingSoon) {
      showComingSoonToast(link.name);
    } else if (link.external && link.href) {
      window.open(link.href, '_blank');
    } else if (link.href) {
      window.location.href = link.href;
    } else {
      showComingSoonToast(link.name);
    }
  };

  return (
    <footer className="border-t border-orange-800/30 py-12 bg-black/95">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold mb-4 text-orange-200">{section.title}</h3>
              <ul className="space-y-2 text-sm text-orange-300/70">
                {section.links.map((link) => (
                  <li key={link.name}>
                    <button
                      onClick={() => handleLinkClick(link)}
                      className="hover:text-orange-400 transition-colors text-left hover:scale-105 transform duration-200"
                    >
                      {link.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="mb-6 bg-orange-800/30" />
        <div className="text-center text-sm text-orange-300/60">
          <p>&copy; 2025 Foxychat. All rights reserved. Built with ❤️ for productivity enthusiasts.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;