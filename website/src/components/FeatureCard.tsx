import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import React from "react";

interface FeatureCardProps {
  title: string;
  description: string;
  imageUrl?: string;
  icon?: React.ReactNode;
  badge?: string;
  gradient?: string;
  className?: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  imageUrl,
  icon,
  badge,
  gradient = "from-orange-500/10 to-amber-500/10",
  className = "",
}) => {
  return (
    <Card
      className={`group border-orange/20 bg-card hover:border-orange/40 hover:shadow-orange-primary/20 relative flex h-full w-full flex-col overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl ${className}`}
    >
      {/* Background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50 transition-opacity duration-500 group-hover:opacity-80`}
      />

      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-[0.02] transition-opacity duration-500 group-hover:opacity-[0.05]">
        <div
          className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_50%,rgba(251,146,60,0.3)_1px,transparent_1px)] bg-[size:20px_20px]"
          style={{ animationDuration: "4s" }}
        />
      </div>

      {/* Badge */}
      {badge && (
        <div className="absolute top-4 right-4 z-10">
          <Badge
            variant="outline"
            className="border-orange-primary/30 bg-orange-primary/10 text-orange-primary backdrop-blur-sm"
          >
            {badge}
          </Badge>
        </div>
      )}

      <CardHeader className="relative z-10 flex-shrink-0 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            {/* Icon or Image */}
            {icon ? (
              <div className="bg-orange-primary/20 text-orange-primary group-hover:bg-orange-primary/30 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110">
                {icon}
              </div>
            ) : (
              imageUrl && (
                <div className="relative h-12 w-12 overflow-hidden rounded-xl">
                  <img
                    src={imageUrl}
                    alt={title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>
              )
            )}

            <div>
              <h3 className="text-primary group-hover:text-orange-primary text-lg font-bold transition-colors duration-300">
                {title}
              </h3>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 flex flex-grow flex-col justify-between">
        <p className="text-secondary group-hover:text-primary/90 leading-relaxed transition-colors duration-300">
          {description}
        </p>

        {/* Feature highlight */}
        <div className="text-orange-primary/70 group-hover:text-orange-primary mt-4 flex items-center space-x-2 transition-colors duration-300">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">AI Powered</span>
        </div>
      </CardContent>

      {/* Hover glow effect */}
      <div className="from-orange-primary/0 via-orange-primary/5 to-orange-primary/0 absolute inset-0 rounded-lg bg-gradient-to-r opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
    </Card>
  );
};

export default FeatureCard;
