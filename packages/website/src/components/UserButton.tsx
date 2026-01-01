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
    return <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200"></div>;
  }

  if (!session) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-orange-800/40 bg-black/20 text-orange-400/80 transition-all duration-300 hover:border-orange-500/80 hover:bg-gradient-to-r hover:from-orange-900/80 hover:to-red-900/80 hover:text-orange-100 hover:shadow-lg hover:shadow-orange-900/40"
        asChild
      >
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
            <AvatarFallback className="bg-black/30 text-orange-400/80 shadow-lg shadow-orange-900/40">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="w-56 bg-zinc-950/95 border-orange-900/40 shadow-xl shadow-orange-900/20 backdrop-blur-md" 
        align="end" 
        forceMount
      >
        <DropdownMenuLabel className="font-normal text-orange-100">
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium text-orange-200">{session.user.name || "User"}</p>
            <p className="text-orange-400/70 text-xs leading-none">{session.user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-orange-900/40" />
        {isAdmin && (
          <DropdownMenuItem asChild>
            <a href="/dashboard" className="flex w-full cursor-pointer items-center text-orange-100 hover:bg-orange-900/40 hover:text-orange-200 focus:bg-orange-900/40 focus:text-orange-200 transition-all duration-200">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href="/settings" className="flex w-full cursor-pointer items-center text-orange-100 hover:bg-orange-900/40 hover:text-orange-200 focus:bg-orange-900/40 focus:text-orange-200 transition-all duration-200">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-orange-900/40" />
        <DropdownMenuItem
          className="cursor-pointer text-red-400 hover:bg-red-900/40 hover:text-red-300 focus:bg-red-900/40 focus:text-red-300 transition-all duration-200"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
