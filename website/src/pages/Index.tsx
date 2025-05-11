import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, MessageSquare, Cpu, Zap, Sparkles, Globe, BrainCircuit } from "lucide-react";
import Navbar from '@/components/Navbar';
import HeroImage from '@/components/HeroImage';
import FeaturesShowcase from '@/components/FeaturesShowcase';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-b from-background to-muted">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col space-y-4">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl">
                <span className="text-primary">Foxychat</span> - Your AI Assistant
              </h1>
              <p className="text-lg text-muted-foreground md:text-xl">
                The next generation all-in-one chat AI agent for your operating system
              </p>
            </div>
            <div className="lg:block">
              <HeroImage />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="w-full py-12 md:py-24 lg:py-32 bg-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Powerful AI Features
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground text-lg">
              Foxychat brings the power of advanced AI to your fingertips
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-12">
            <div>
              <FeaturesShowcase />
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Designed for Productivity</h3>
              <p className="text-muted-foreground">Foxychat understands your needs and adapts to your workflow, helping you accomplish more in less time.</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span>Understands natural language commands</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span>Integrates with your favorite applications</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span>Learns from your interactions</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary" />
                  <span>Works offline for privacy and reliability</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard 
              icon={<MessageSquare className="h-10 w-10 text-primary" />}
              title="Natural Conversations"
              description="Chat with Foxychat just like you would with a human. Natural language understanding makes interactions seamless."
            />
            <FeatureCard 
              icon={<Cpu className="h-10 w-10 text-primary" />}
              title="System Integration"
              description="Foxychat integrates deeply with your operating system, providing powerful control and automation."
            />
            <FeatureCard 
              icon={<Zap className="h-10 w-10 text-primary" />}
              title="Lightning Fast"
              description="Built for speed and efficiency, Foxychat responds instantly to your commands and questions."
            />
            <FeatureCard 
              icon={<Sparkles className="h-10 w-10 text-primary" />}
              title="Smart Assistance"
              description="From writing emails to coding and creativity, Foxychat helps with a wide range of tasks."
            />
            <FeatureCard 
              icon={<Globe className="h-10 w-10 text-primary" />}
              title="Access Anywhere"
              description="Use Foxychat across all your devices with perfect synchronization and continuity."
            />
            <FeatureCard 
              icon={<BrainCircuit className="h-10 w-10 text-primary" />}
              title="Always Learning"
              description="Foxychat learns from your interactions to provide increasingly personalized assistance."
            />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      {/* 
      <section id="pricing" className="w-full py-12 md:py-24 lg:py-32 bg-muted">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground text-lg">
              Choose the plan that's right for you
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <PricingCard 
              title="Free"
              price="$0"
              description="Perfect for trying out Foxychat"
              features={[
                "Basic conversation abilities",
                "System information",
                "Limited requests per day",
                "Standard response time"
              ]}
              buttonText="Get Started"
              buttonVariant="outline"
            />
            <PricingCard 
              title="Pro"
              price="$9.99"
              period="per month"
              description="For individuals who need more power"
              features={[
                "Advanced conversation abilities",
                "Deep system integration",
                "Unlimited requests",
                "Faster response time",
                "Custom instructions"
              ]}
              buttonText="Subscribe Now"
              buttonVariant="default"
              highlighted={true}
            />
            <PricingCard 
              title="Team"
              price="$19.99"
              period="per month"
              description="For small teams and businesses"
              features={[
                "Everything in Pro",
                "Team management",
                "Shared resources",
                "Analytics dashboard",
                "Priority support"
              ]}
              buttonText="Contact Sales"
              buttonVariant="outline"
            />
          </div>
        </div>
      </section>
      */}

      {/* Testimonials */}
      <section id="testimonials" className="w-full py-12 md:py-24 lg:py-32 bg-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Loved by Users
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground text-lg">
              See what others are saying about Foxychat
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <TestimonialCard 
              content="Foxychat has completely changed how I interact with my computer. It's like having a smart assistant that understands exactly what I need."
              author="Sarah Johnson"
              role="Product Designer"
            />
            <TestimonialCard 
              content="The coding assistance is phenomenal. It's helped me solve complex problems quickly and improved my productivity tenfold."
              author="Michael Chen"
              role="Software Developer"
            />
            <TestimonialCard 
              content="I use Foxychat daily for everything from scheduling to research. It integrates perfectly with my workflow and saves me hours every week."
              author="Emma Rodriguez"
              role="Marketing Manager"
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full py-12 md:py-24 lg:py-32 bg-muted">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto max-w-[700px] text-muted-foreground text-lg">
              Find answers to common questions about Foxychat
            </p>
          </div>
          
          <div className="mx-auto max-w-3xl space-y-4">
            <FaqItem 
              question="What makes Foxychat different from other AI assistants?"
              answer="Foxychat is designed specifically for deep operating system integration, providing a seamless experience across your entire digital environment. Unlike other AI assistants that work primarily through web interfaces, Foxychat works directly with your local applications and files."
            />
            <FaqItem 
              question="Is my data secure with Foxychat?"
              answer="Yes, we take security very seriously. All data processing happens on your device when possible, and any data sent to our servers is encrypted end-to-end. We never sell your data or use it for advertising."
            />
            <FaqItem 
              question="Which operating systems does Foxychat support?"
              answer="Foxychat currently supports Windows, macOS, and most popular Linux distributions. We're constantly working to expand our compatibility with more platforms."
            />
            <FaqItem 
              question="Can I use Foxychat offline?"
              answer="Yes, Foxychat has a core set of features that work offline. However, some advanced capabilities like web searches require an internet connection."
            />
            <FaqItem 
              question="How do I update Foxychat?"
              answer="Foxychat updates automatically by default, ensuring you always have the latest features and security improvements without any manual intervention."
            />
          </div>
        </div>
      </section>

      {/* CTA Section
      <section className="w-full py-12 md:py-24 lg:py-32 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-6 text-center">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Ready to Experience the Future?
            </h2>
            <p className="mx-auto max-w-[700px] text-lg opacity-90">
              Join thousands of users already enhancing their productivity with Foxychat
            </p>
            <p className="text-sm opacity-90">
              Coming soon for macOS, Windows, and Linux
            </p>
          </div>
        </div>
      </section> */}

      {/* Footer */}
      <footer className="w-full py-6 bg-gray-950 text-white">
        <div className="container px-4 md:px-6">
          <div className="flex flex-row justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center mr-2">
                <svg 
                  width="18" 
                  height="18" 
                  viewBox="0 0 40 40" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-white"
                >
                  <path 
                    d="M20 5C11.716 5 5 11.716 5 20C5 28.284 11.716 35 20 35C28.284 35 35 28.284 35 20C35 11.716 28.284 5 20 5Z" 
                    fill="currentColor" 
                  />
                </svg>
              </div>
              <span className="font-medium">Foxychat</span>
            </div>
            <div className="flex items-center gap-8">
              <p className="text-sm opacity-70">
                © 2023 Foxychat. All rights reserved.
              </p>
              <div className="flex gap-6">
                <a href="#" className="text-sm opacity-70 hover:opacity-100 hover:text-primary transition-colors duration-200 relative after:absolute after:left-0 after:bottom-[-2px] after:h-[1px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:text-primary">Privacy</a>
                <a href="#" className="text-sm opacity-70 hover:opacity-100 hover:text-primary transition-colors duration-200 relative after:absolute after:left-0 after:bottom-[-2px] after:h-[1px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:text-primary">Terms</a>
                <a href="#" className="text-sm opacity-70 hover:opacity-100 hover:text-primary transition-colors duration-200 relative after:absolute after:left-0 after:bottom-[-2px] after:h-[1px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:text-primary">Contact</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/50">
      <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="transition-transform duration-300 hover:scale-110">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
};

const PricingCard = ({ title, price, period, description, features, buttonText, buttonVariant, highlighted = false }: {
  title: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  buttonText: string;
  buttonVariant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  highlighted?: boolean;
}) => {
  return (
    <Card className={`flex flex-col justify-between ${highlighted ? 'border-primary shadow-lg' : ''}`}>
      <CardContent className="p-6">
        <div className="mb-6 space-y-2 text-center">
          <h3 className="text-2xl font-bold">{title}</h3>
          <div className="flex justify-center items-end">
            <span className="text-4xl font-bold">{price}</span>
            {period && <span className="text-muted-foreground ml-1">{period}</span>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <ul className="mb-6 space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <div className="p-6 pt-0">
        <Button variant={buttonVariant} className={`w-full transition-all duration-300 ${highlighted ? 'shadow-lg hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-1' : 'hover:shadow-md hover:-translate-y-0.5'}`}>
          {buttonText}
        </Button>
      </div>
    </Card>
  );
};

const TestimonialCard = ({ content, author, role }: {
  content: string;
  author: string;
  role: string;
}) => {
  return (
    <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/30">
      <CardContent className="p-6 space-y-4">
        <p className="italic text-muted-foreground">"{content}"</p>
        <div>
          <p className="font-semibold">{author}</p>
          <p className="text-sm text-muted-foreground">{role}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const FaqItem = ({ question, answer }: {
  question: string;
  answer: string;
}) => {
  return (
    <Card className="transition-all duration-300 hover:shadow-md hover:border-primary/20">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold mb-2">{question}</h3>
        <p className="text-muted-foreground">{answer}</p>
      </CardContent>
    </Card>
  );
};

export default Index;
