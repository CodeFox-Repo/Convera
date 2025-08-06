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
          ? "border-orange-400 bg-orange-50/50 shadow-lg"
          : "border-gray-200 bg-white hover:shadow-xl"
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
        <CardTitle className="text-xl font-bold text-gray-900">{title}</CardTitle>
        <CardDescription className="text-gray-600">{description}</CardDescription>

        <div className="pt-4">
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold text-gray-900">{price}</span>
              {couponLabel && (
                <span className="inline-block rounded-md bg-orange-400 px-2 py-1 text-xs font-semibold text-white">
                  {couponLabel}
                </span>
              )}
            </div>
            {priceSubtitle && <p className="mt-1 text-sm text-gray-600">{priceSubtitle}</p>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pt-2">
        <ul className="mb-6 flex-1 space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 flex-shrink-0 text-green-500" />
              <span className="text-sm text-gray-600">{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          variant={buttonVariant}
          size="lg"
          className={`w-full rounded-full font-semibold transition-all duration-300 hover:scale-105 ${
            isPopular
              ? "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-md hover:shadow-lg"
              : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
};
