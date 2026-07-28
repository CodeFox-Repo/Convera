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
          ? "border-terracotta-line bg-well"
          : "border-rule bg-well hover:border-terracotta-line"
      } ${className}`}
    >
      {isPopular && (
        <div className="bg-primary text-primary-foreground absolute top-0 right-0 z-10 rounded-bl-2xl px-4 py-1.5 text-xs font-semibold">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3" />
            Popular
          </div>
        </div>
      )}

      <CardHeader className="pb-6 text-left">
        <CardTitle className="text-ink text-xl font-bold">{title}</CardTitle>
        <CardDescription className="text-ink-muted">{description}</CardDescription>

        <div className="pt-4">
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="text-ink text-4xl font-bold">{price}</span>
              {couponLabel && (
                <span className="bg-terracotta-wash text-terracotta inline-block rounded-md px-2 py-1 text-xs font-semibold">
                  {couponLabel}
                </span>
              )}
            </div>
            {priceSubtitle && <p className="text-ink-faint mt-1 text-sm">{priceSubtitle}</p>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col pt-2">
        <ul className="mb-6 flex-1 space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 flex-shrink-0 text-green-400" />
              <span className="text-ink-3 text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          variant={buttonVariant}
          size="lg"
          className={`w-full rounded-full font-semibold transition-all duration-300 hover:scale-105 ${
            isPopular
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-rule bg-paper text-ink hover:border-terracotta-line hover:bg-paper-2"
          }`}
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
};
