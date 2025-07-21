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
      <Card className="group h-full transform cursor-pointer border border-gray-200 bg-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl">
        <CardContent className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 transition-all duration-300 group-hover:scale-110 group-hover:bg-gray-200">
            {Icon && (
              <Icon className="h-8 w-8 text-gray-700 transition-colors duration-300 group-hover:text-black" />
            )}
            {svgIcon && (
              <div
                className="h-8 w-8 text-gray-700 transition-colors duration-300 group-hover:text-black"
                dangerouslySetInnerHTML={{ __html: svgIcon }}
              />
            )}
          </div>
          <h3 className="mb-4 text-xl font-semibold text-gray-900">{title}</h3>
          <p className="mb-6 leading-relaxed text-gray-600">{description}</p>
          <div className="mt-auto">
            <span className="inline-flex items-center rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white transition-all duration-300 group-hover:bg-gray-800">
              {buttonText}
            </span>
          </div>
        </CardContent>
      </Card>
    </CardWrapper>
  );
};

export default CommunityCard;
