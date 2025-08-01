import { PricingCard } from "@/components/pricing_card";
import { toast } from "@/components/ui/use-toast";
import { getBaseURL, useSession } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import Footer from "./Footer";
import Navbar from "./Navbar";

const Pricing: React.FC = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [subscriptionData, setSubscriptionData] = useState<{
    hasSubscribedBefore: boolean;
  } | null>(null);
  const [isVisible, setIsVisible] = useState({
    hero: false,
  });

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target.getAttribute("data-section");
            if (target) {
              setIsVisible((prev) => ({ ...prev, [target]: true }));
            }
          }
        });
      },
      { threshold: 0.1 },
    );

    const sections = document.querySelectorAll("[data-section]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

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
    <div className="bg-background min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative w-full overflow-hidden py-12 pt-32 md:py-16 md:pt-40"
        data-section="hero"
      >
        {/* Enhanced background with gradient and patterns */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-50"></div>

        {/* Geometric background pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_25%_25%,rgba(59,130,246,0.05)_0%,transparent_50%),radial-gradient(circle_at_75%_75%,rgba(147,51,234,0.05)_0%,transparent_50%)]"></div>
        </div>

        {/* Floating geometric shapes */}
        <div
          className="animate-float absolute top-10 left-10 h-20 w-20 rounded-lg bg-blue-200/30 blur-sm"
          style={{ animationDelay: "0s" }}
        ></div>
        <div
          className="animate-float absolute top-32 right-20 h-16 w-16 rounded-full bg-purple-200/30 blur-sm"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="animate-float absolute bottom-40 left-20 h-12 w-12 rounded-lg bg-indigo-200/30 blur-sm"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="animate-float absolute right-32 bottom-20 h-24 w-24 rounded-full bg-pink-200/30 blur-sm"
          style={{ animationDelay: "0.5s" }}
        ></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-center">
            {/* Centered Content with stagger animation */}
            <div
              className={`max-w-7xl space-y-6 text-center transition-all duration-1000 lg:space-y-8 ${
                isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
            >
              <h1
                className={`text-3xl leading-tight font-bold tracking-tight text-gray-800 sm:text-4xl md:text-5xl ${
                  isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                }`}
              >
                Choose Your{" "}
                <span className="bg-gradient-to-r from-orange-500 to-orange-400 bg-clip-text text-transparent">
                  Perfect Plan
                </span>
              </h1>
              <p
                className={`text-muted-foreground mx-auto text-lg leading-relaxed font-medium md:text-xl ${
                  isVisible.hero ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
              >
                Choose the plan that fits your needs and start using Foxychat today.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards Section */}
      <section className="bg-gradient-to-br from-gray-50 via-white to-gray-50 py-16">
        <div className="container mx-auto max-w-7xl px-4 md:px-6">
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
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Pricing;
