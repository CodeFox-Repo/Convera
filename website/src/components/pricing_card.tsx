import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Star } from "lucide-react";
import React from "react";

interface PricingCardProps {
  title: string;
  description: string;
  price: string;
  couponLabel?: string;
  priceSubtitle?: string;
  features: string[];
  buttonText: string;
  buttonVariant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link";
  isPopular?: boolean;
  onButtonClick?: () => void;
  className?: string;
}

export const PricingCard: React.FC<PricingCardProps> = ({
  title,
  description,
  price,
  couponLabel,
  priceSubtitle,
  features,
  buttonText,
  buttonVariant = "default",
  isPopular = false,
  onButtonClick,
  className = "",
}) => {
  return (
    <Card
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-300 ${
        isPopular
          ? "border-orange-400/50 bg-gradient-to-br from-zinc-900/90 to-black/90 shadow-lg shadow-orange-500/20 backdrop-blur-sm"
          : "border-zinc-700/50 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 backdrop-blur-sm hover:border-orange-500/30 hover:shadow-xl hover:shadow-orange-500/10"
      } ${className}`}
    >
      {isPopular && (
        <div className="absolute top-0 right-0 z-10 rounded-bl-2xl bg-gradient-to-r from-orange-500 to-orange-400 px-4 py-1.5 text-xs font-semibold text-white">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            Popular
          </div>
        </div>
      )}

      <CardHeader className="pb-6 text-left">
        <CardTitle className="text-xl font-bold text-white">{title}</CardTitle>
        <CardDescription className="text-zinc-300">{description}</CardDescription>

        <div className="pt-4">
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold text-white">{price}</span>
              {couponLabel && (
                <span className="inline-block rounded-md bg-orange-400 px-2 py-1 text-xs font-semibold text-white">
                  {couponLabel}
                </span>
              )}
            </div>
            {priceSubtitle && <p className="mt-1 text-sm text-zinc-400">{priceSubtitle}</p>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pt-2">
        <ul className="mb-6 flex-1 space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 flex-shrink-0 text-green-400" />
              <span className="text-sm text-zinc-300">{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          variant={buttonVariant}
          size="lg"
          className={`w-full rounded-full font-semibold transition-all duration-300 hover:scale-105 ${
            isPopular
              ? "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-md hover:from-orange-400 hover:to-orange-300 hover:shadow-lg hover:shadow-orange-500/30"
              : "border-zinc-600 bg-zinc-800 text-white hover:border-orange-500/50 hover:bg-zinc-700"
          }`}
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
};
