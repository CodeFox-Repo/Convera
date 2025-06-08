import { Alert, AlertDescription } from "@/renderer/components/ui/alert";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { authClient } from "@/renderer/libs/auth-client";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";

interface AuthModalProps {
  onClose?: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    if (isSignUp) {
      // Sign Up logic
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setIsLoading(false);
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters long");
        setIsLoading(false);
        return;
      }

      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (result.error) {
        setError(result.error.message || "Failed to create account");
      } else {
        setSuccess(
          "Account created successfully! Please check your email to verify your account.",
        );
        onClose?.();
      }
    } else {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Failed to sign in");
      } else {
        onClose?.();
      }
    }

    setIsLoading(false);
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    setError("");
    setSuccess("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setName("");
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6 ">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground">
          {isSignUp ? "Sign Up" : "Sign In"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {isSignUp
            ? "Enter your information to create an account"
            : "Enter your email below to login to your account"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 min-h-[320px]">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name" className="text-foreground">
              Name
            </Label>
            <Input
              className="text-foreground"
              id="name"
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">
            Email
          </Label>
          <Input
            className="text-foreground"
            id="email"
            type="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">
            Password
          </Label>
          <Input
            className="text-foreground"
            id="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            minLength={isSignUp ? 8 : undefined}
          />
        </div>

        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-foreground">
              Confirm Password
            </Label>
            <Input
              className="text-foreground"
              id="confirmPassword"
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSignUp ? "Create an account" : "Login"}
        </Button>

        {!isSignUp && (
          <div className="text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              Forgot your password?
            </button>
          </div>
        )}
      </form>

      <div className="text-center">
        <span className="text-sm text-muted-foreground">
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
        </span>
        <button
          type="button"
          onClick={switchMode}
          className="text-sm text-primary hover:underline underline-offset-4"
          disabled={isLoading}
        >
          {isSignUp ? "Sign In" : "Sign Up"}
        </button>
      </div>
    </div>
  );
}
