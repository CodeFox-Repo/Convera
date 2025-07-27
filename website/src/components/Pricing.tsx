import { PricingCard } from "@/components/pricing_card";
import { toast } from "@/components/ui/use-toast";
import { getBaseURL, useSession } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import Navbar from "./Navbar";

const Pricing: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [subscriptionData, setSubscriptionData] = useState<{
    hasSubscribedBefore: boolean;
  } | null>(null);

  // Fetch user subscription data
  useEffect(() => {
    const fetchSubscriptionData = async () => {
      if (!session?.user) {
        return;
      }

      try {
        const response = await fetch(`${getBaseURL()}/api/subscription/user-subscription`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSubscriptionData(data);
        }
      } catch (error) {
        console.error("Failed to fetch subscription data:", error);
      }
    };

    fetchSubscriptionData();
  }, [session]);

  const handleFree = () => {
    // Redirect to download page
    router.navigate({ to: "/download" });
  };

  const handleUpgrade = async (planName: string) => {
    // Check if user is authenticated
    if (!session?.user) {
      // Redirect to login
      router.navigate({
        to: "/auth/$pathname",
        params: { pathname: "sign-in" },
        search: { redirect: router.state.location.pathname },
      });
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
        if (response.status === 409) {
          router.navigate({ to: "/settings" });
          toast({
            title: "Already Subscribed",
            description: "You are already subscribed to this plan. Redirecting to your settings.",
          });
          return;
        }
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
          <div className="mx-auto grid max-w-4xl justify-center gap-8 md:grid-cols-2 md:gap-6 lg:gap-8">
            {/* Free */}
            <PricingCard
              title="Free"
              description="Start here and try our product"
              price="$0"
              features={["All basic features", "base rate limit"]}
              buttonText="Download"
              buttonVariant="outline"
              onButtonClick={handleFree}
            />

            {/* Pro Plan */}
            <PricingCard
              title="Pro"
              description="For power users and professionals"
              price={!subscriptionData?.hasSubscribedBefore ? "$12.00" : "$19.00"}
              couponLabel={
                !subscriptionData?.hasSubscribedBefore ? "1st Month Discount" : undefined
              }
              priceSubtitle={
                !subscriptionData?.hasSubscribedBefore
                  ? "$19.00 from the second month, billed monthly"
                  : ""
              }
              features={[
                "All feature in Free",
                "Boosted AI Model rate limits for advanced usage",
                "Priority response time",
              ]}
              buttonText="Upgrade to Pro"
              isPopular={true}
              onButtonClick={() => handleUpgrade("Pro")}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
