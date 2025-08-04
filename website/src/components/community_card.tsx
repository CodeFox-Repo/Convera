import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";

interface CommunityCardProps {
  icon?: LucideIcon;
  svgIcon?: string;
  title: string;
  description: string;
  buttonText: string;
  href: string;
  isExternal?: boolean;
}

const CommunityCard = ({
  icon: Icon,
  svgIcon,
  title,
  description,
  buttonText,
  href,
  isExternal = false,
}: CommunityCardProps) => {
  const CardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (isExternal) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {children}
        </a>
      );
    }
    return (
      <Link to={href} className="block">
        {children}
      </Link>
    );
  };

  return (
    <CardWrapper>
      <Card className="group h-full transform cursor-pointer border border-orange-800/30 bg-black/80 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/20">
        <CardContent className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-900/30 transition-all duration-300 group-hover:scale-110 group-hover:bg-orange-800/50">
            {Icon && (
              <Icon className="h-8 w-8 text-orange-300 transition-colors duration-300 group-hover:text-orange-200" />
            )}
            {svgIcon && (
              <div
                className="h-8 w-8 text-orange-300 transition-colors duration-300 group-hover:text-orange-200"
                dangerouslySetInnerHTML={{ __html: svgIcon }}
              />
            )}
          </div>
          <h3 className="mb-4 text-xl font-semibold text-orange-200">{title}</h3>
          <p className="mb-6 leading-relaxed text-orange-300/70">{description}</p>
          <div className="mt-auto">
            <span className="inline-flex items-center rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 group-hover:from-orange-500 group-hover:to-amber-500 group-hover:shadow-lg group-hover:shadow-orange-500/25">
              {buttonText}
            </span>
          </div>
        </CardContent>
      </Card>
    </CardWrapper>
  );
};

export default CommunityCard;
