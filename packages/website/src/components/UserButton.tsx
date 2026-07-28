import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, LogIn, LogOut, Settings } from "lucide-react";
import { useAdminStatus } from "@/lib/admin-store";

export function UserButton() {
  const { data: session, isPending } = useSession();
  const { isAdmin, isLoading: isCheckingAdmin } = useAdminStatus();

  if (isPending || isCheckingAdmin) {
    return <div className="bg-secondary h-8 w-8 animate-pulse rounded-full"></div>;
  }

  if (!session) {
    return (
      <Button variant="outline" size="sm" className="font-mono text-[13px]" asChild>
        <Link
          to="/auth/$pathname"
          params={{ pathname: "sign-in" }}
          search={{ redirect: undefined }}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign In
        </Link>
      </Button>
    );
  }

  const userInitials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : session.user.email?.[0]?.toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session.user.image || ""} alt={session.user.name || ""} />
            <AvatarFallback className="bg-secondary text-terracotta">{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-foreground text-sm leading-none font-medium">
              {session.user.name || "User"}
            </p>
            <p className="text-muted-foreground text-xs leading-none">{session.user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="" />
        {isAdmin && (
          <DropdownMenuItem asChild>
            <a href="/dashboard" className="flex w-full cursor-pointer items-center">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href="/settings" className="flex w-full cursor-pointer items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="" />
        <DropdownMenuItem className="text-destructive cursor-pointer" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
