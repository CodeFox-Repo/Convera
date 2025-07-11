import { PricingCard } from "@/components/pricing-card";
import { toast } from "@/components/ui/use-toast";
import { getBaseURL, useSession } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";
import React from "react";
import Navbar from "./Navbar";

const Pricing: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();

  const handleFree = () => {
    // Redirect to download page
    router.navigate({ to: "/download" });
  };

  const handleUpgrade = async (planName: string) => {
    // Check if user is authenticated
    if (!session?.user) {
      // Redirect to login
      router.navigate({ to: "/auth/$pathname", params: { pathname: "sign-in" } });
      return;
    }

    try {
      // Create checkout session
      const response = await fetch(`${getBaseURL()}/api/subscription/create-checkout-session`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planName: planName,
          customerEmail: session.user.email,
          automaticTax: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const data = await response.json();

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout Failed",
        description: error instanceof Error ? error.message : "Failed to start checkout process",
        variant: "destructive",
      });
    }
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
              title="Basic"
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
              onButtonClick={() => handleUpgrade("Basic")}
            />

            {/* Pro Plus */}
            <PricingCard
              title="Pro"
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
              onButtonClick={() => handleUpgrade("Pro")}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
