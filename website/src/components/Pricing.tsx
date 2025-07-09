import { PricingCard } from "@/components/ui/pricing-card";
import { useRouter } from "@tanstack/react-router";
import React from "react";
import Navbar from "./Navbar";

const Pricing: React.FC = () => {
  const router = useRouter();

  const handleFree = () => {
    // Redirect to download page
    router.navigate({ to: "/download" });
  };

  const handleProUpgrade = () => {
    // Handle Pro plan upgrade
    console.log("Upgrading to Pro...");
  };

  const handleProPlusUpgrade = () => {
    // Handle Pro Plus plan upgrade
    console.log("Upgrading to Pro Plus...");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <Navbar />

      {/* Hero Section */}
      <div className="pt-24 pb-16">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
          <div className="mb-16 text-center">
            <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">
              Choose Your{" "}
              <span className="bg-gradient-to-r from-orange-500 to-orange-400 bg-clip-text text-transparent">
                Perfect Plan
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-gray-600">
              Choose the plan that fits your needs and start using Foxychat today.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
            {/* Free */}
            <PricingCard
              title="Free"
              description="Start here and try our product"
              price="Free"
              features={["Basic AI models", "Basic chat history"]}
              buttonText="Download"
              buttonVariant="outline"
              onButtonClick={handleFree}
            />

            {/* Pro Plan */}
            <PricingCard
              title="Pro"
              description="For power users and professionals"
              price="$9.99"
              period="month"
              features={[
                "Advanced AI models (GPT-4.1-mini)",
                "Priority response time",
                "API access",
                "Advanced integrations",
              ]}
              buttonText="Upgrade to Pro"
              isPopular={true}
              onButtonClick={handleProUpgrade}
            />

            {/* Pro Plus */}
            <PricingCard
              title="Pro Plus"
              description="The most powerful plan"
              price="$20"
              period="month"
              features={[
                "Everything in Pro",
                "Premium AI models (Claude Sonnet 4.....)",
                "24/7 priority support",
              ]}
              buttonText="Upgrade to Pro Plus"
              buttonVariant="outline"
              onButtonClick={handleProPlusUpgrade}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
