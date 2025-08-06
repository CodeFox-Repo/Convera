import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Sparkles } from "lucide-react";

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
    <Card className={`group relative overflow-hidden border-orange/20 bg-card hover:border-orange/40 transition-all duration-500 hover:shadow-2xl hover:shadow-orange-primary/20 hover:-translate-y-1 flex flex-col h-full w-full ${className}`}>
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50 group-hover:opacity-80 transition-opacity duration-500`} />
      
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity duration-500">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,146,60,0.3)_1px,transparent_1px)] bg-[size:20px_20px] animate-pulse" style={{ animationDuration: '4s' }} />
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

      <CardHeader className="relative z-10 pb-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            {/* Icon or Image */}
            {icon ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-primary/20 text-orange-primary group-hover:bg-orange-primary/30 group-hover:scale-110 transition-all duration-300">
                {icon}
              </div>
            ) : imageUrl && (
              <div className="relative h-12 w-12 overflow-hidden rounded-xl">
                <img
                  src={imageUrl}
                  alt={title}
                  className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
            )}
            
            <div>
              <h3 className="text-lg font-bold text-primary group-hover:text-orange-primary transition-colors duration-300">
                {title}
              </h3>
            </div>
          </div>
          
          {/* Arrow icon */}
          <ArrowUpRight className="h-5 w-5 text-orange-primary/60 group-hover:text-orange-primary group-hover:scale-110 group-hover:rotate-12 transition-all duration-300" />
        </div>
      </CardHeader>

      <CardContent className="relative z-10 flex-grow flex flex-col justify-between">
        <p className="text-secondary group-hover:text-primary/90 transition-colors duration-300 leading-relaxed">
          {description}
        </p>

        {/* Feature highlight */}
        <div className="mt-4 flex items-center space-x-2 text-orange-primary/70 group-hover:text-orange-primary transition-colors duration-300">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">AI Powered</span>
        </div>
      </CardContent>

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-orange-primary/0 via-orange-primary/5 to-orange-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </Card>
  );
};

export default FeatureCard;