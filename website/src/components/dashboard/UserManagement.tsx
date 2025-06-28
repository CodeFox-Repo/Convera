import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { baseURL } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  image?: string;
}

export function UserManagement() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${baseURL}/api/users`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: "user" | "admin") => {
    setUpdatingUserId(userId);
    try {
      const response = await fetch(`${baseURL}/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        // Update the user in the local state
        setUsers((prev) =>
          prev.map((user) => (user.id === userId ? { ...user, role: newRole } : user)),
        );
      } else {
        console.error("Failed to update user role");
      }
    } catch (error) {
      console.error("Error updating user role:", error);
    } finally {
      setUpdatingUserId(null);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded bg-gray-200"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            View and manage user roles. You can promote users to admin or demote them to regular
            users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-sm font-medium text-white">
                        {user.name
                          ? user.name.charAt(0).toUpperCase()
                          : user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium">{user.name || "No Name"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? (
                        <>
                          <Shield className="mr-1 h-3 w-3" />
                          Admin
                        </>
                      ) : (
                        "User"
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.emailVerified ? "default" : "outline"}>
                      {user.emailVerified ? "Verified" : "Unverified"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(user.createdAt)}</TableCell>
                  <TableCell>
                    {user.id !== session?.user?.id && (
                      <Select
                        value={user.role}
                        onValueChange={(newRole: "user" | "admin") =>
                          updateUserRole(user.id, newRole)
                        }
                        disabled={updatingUserId === user.id}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {user.id === session?.user?.id && (
                      <span className="text-muted-foreground text-xs">You</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
