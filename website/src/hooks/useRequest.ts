import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { getBaseURL } from '@/lib/auth-client';
import { baseURL } from '@/lib/api-client';

// Unified query keys
export const QUERY_KEYS = {
  // Agent Market
  agents: ['agents'] as const,
  agentById: (id: string) => ['agents', id] as const,
  
  // MCP/Apps
  apps: ['apps'] as const,
  appById: (id: string) => ['apps', id] as const,
  
  // Users
  users: ['users'] as const,
  userStats: ['users', 'stats'] as const,
  userById: (id: string) => ['users', id] as const,
  
  // Dashboard
  dashboardStats: ['dashboard', 'stats'] as const,
} as const;

// Default query configuration
const DEFAULT_QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
  retry: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  refetchOnWindowFocus: false,
  refetchOnMount: true,
};

const DEFAULT_MUTATION_CONFIG = {
  retry: 1,
  retryDelay: 1000,
};

// ===========================================
// Agent Market Hooks
// ===========================================

// Transform API response to MarketAgent format
interface MarketAgentApiResponse {
  agentId: string | number;
  agentJson: {
    name: string;
    description: string;
    systemPrompt: string;
    predefined: boolean;
    selectedMCPs: string[];
    disableToolReferences: string[];
    createdAt?: string;
    updatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
  mcpInstallations: Record<string, unknown>;
}

const transformAgentData = (data: MarketAgentApiResponse[]) => {
  return data.map((item) => ({
    id: item.agentId,
    name: item.agentJson.name,
    description: item.agentJson.description,
    systemPrompt: item.agentJson.systemPrompt,
    predefined: item.agentJson.predefined,
    selectedMCPs: item.agentJson.selectedMCPs,
    disableToolReferences: item.agentJson.disableToolReferences,
    createdAt: item.agentJson.createdAt ?? item.createdAt,
    updatedAt: item.agentJson.updatedAt ?? item.updatedAt,
    mcpInstallations: item.mcpInstallations as Record<string, unknown>,
  }));
};

export const useAgents = () => {
  return useQuery({
    queryKey: QUERY_KEYS.agents,
    queryFn: async () => {
      const res = await fetch(`${getBaseURL()}/api/agent-market`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch agents');
      }
      const data = await res.json();
      return transformAgentData(data);
    },
    ...DEFAULT_QUERY_CONFIG,
  });
};

export const useCreateAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { agentJson: string; mcpInstallations: string }) => {
      const res = await fetch(`${getBaseURL()}/api/agent-market`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Failed to create agent');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.agents });
      toast({ title: 'Success', description: 'Agent created successfully' });
    },
    onError: (error: Error) => {
      console.error('Create agent error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useUpdateAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      agentId, 
      data 
    }: { 
      agentId: string | number; 
      data: { agentJson: string; mcpInstallations: string } 
    }) => {
      const res = await fetch(`${getBaseURL()}/api/agent-market/${agentId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Failed to update agent');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.agents });
      toast({ title: 'Success', description: 'Agent updated successfully' });
    },
    onError: (error: Error) => {
      console.error('Update agent error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useDeleteAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (agentId: string | number) => {
      const res = await fetch(`${getBaseURL()}/api/agent-market/${agentId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to delete agent');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.agents });
      toast({ title: 'Success', description: 'Agent deleted successfully' });
    },
    onError: (error: Error) => {
      console.error('Delete agent error:', error);
      toast({ title: 'Error', description: 'Failed to delete agent', variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useDownloadAgent = () => {
  return useMutation({
    mutationFn: async (agentId: string | number) => {
      const res = await fetch(`${getBaseURL()}/api/agent-market/${agentId}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to download agent');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${agentId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    onError: (error: Error) => {
      console.error('Download agent error:', error);
      toast({ title: 'Error', description: 'Download failed', variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useImportAgent = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text);
      
      const res = await fetch(`${getBaseURL()}/api/agent-market`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(json),
      });

      if (!res.ok) {
        throw new Error('Import failed');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.agents });
      toast({ title: 'Success', description: 'Agent imported successfully' });
    },
    onError: (error: Error) => {
      console.error('Import agent error:', error);
      toast({ 
        title: 'Error', 
        description: 'Invalid JSON or import failed', 
        variant: 'destructive' 
      });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

// ===========================================
// Apps/MCP Hooks
// ===========================================

export const useApps = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: QUERY_KEYS.apps,
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/app`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch apps');
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error('Failed to fetch apps');
      }
      return data.data.mcpServers;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes for apps
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? false, // Only fetch when explicitly needed
  });
};

export const useCreateApp = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(`${baseURL}/api/app`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create app');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apps });
      toast({ title: 'Success', description: 'App MCP created successfully' });
    },
    onError: (error: Error) => {
      console.error('Create app error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useUpdateApp = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      appId, 
      data 
    }: { 
      appId: string; 
      data: Record<string, unknown>
    }) => {
      const res = await fetch(`${baseURL}/api/app/${appId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update app');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apps });
      toast({ title: 'Success', description: 'App MCP updated successfully' });
    },
    onError: (error: Error) => {
      console.error('Update app error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useDeleteApp = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (appId: string) => {
      const res = await fetch(`${baseURL}/api/app/${appId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete app');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apps });
      toast({ title: 'Success', description: 'App MCP deleted successfully' });
    },
    onError: (error: Error) => {
      console.error('Delete app error:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

export const useImportApps = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (formDataArray: FormData[]) => {
      const importPromises = formDataArray.map(formData => 
        fetch(`${baseURL}/api/app`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
      );

      const results = await Promise.allSettled(importPromises);
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return { successful, failed };
    },
    onSuccess: ({ successful, failed }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.apps });
      if (successful > 0) {
        toast({
          title: 'Import completed',
          description: `Successfully imported ${successful} App MCP${failed > 0 ? `, ${failed} failed` : ''}`,
        });
      } else {
        toast({
          title: 'Import failed',
          description: 'No App MCP were imported successfully',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      console.error('Import apps error:', error);
      toast({ 
        title: 'Error', 
        description: 'Invalid JSON format', 
        variant: 'destructive' 
      });
    },
    ...DEFAULT_MUTATION_CONFIG,
  });
};

// ===========================================
// Users Hooks
// ===========================================

export const useUserStats = () => {
  return useQuery({
    queryKey: QUERY_KEYS.userStats,
    queryFn: async () => {
      const res = await fetch(`${baseURL}/api/users/stats`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch user stats');
      }
      const data = await res.json();
      return data.stats;
    },
    ...DEFAULT_QUERY_CONFIG,
  });
};

// ===========================================
// Dashboard Hooks
// ===========================================

export const useDashboardStats = () => {
  return useQuery({
    queryKey: QUERY_KEYS.dashboardStats,
    queryFn: async () => {
      const [userResponse, mcpResponse, agentMarketResponse] = await Promise.all([
        fetch(`${baseURL}/api/users/stats`, {
          credentials: 'include',
        }),
        fetch(`${baseURL}/api/app`, {
          credentials: 'include',
        }),
        fetch(`${getBaseURL()}/api/agent-market`, {
          credentials: 'include',
        }),
      ]);

      const userData = userResponse.ok ? await userResponse.json() : null;
      const mcpData = mcpResponse.ok ? await mcpResponse.json() : null;
      const agentMarketData = agentMarketResponse.ok ? await agentMarketResponse.json() : null;

      const mcpServers = mcpData?.data?.mcpServers || [];
      const agentMarketAgents = Array.isArray(agentMarketData) ? agentMarketData : [];
      
      return {
        ...userData?.stats,
        mcpServers: {
          total: mcpServers.length,
          enabled: mcpServers.filter((s: { enabled: boolean }) => s.enabled).length,
        },
        agentMarket: {
          total: agentMarketAgents.length,
        },
      };
    },
    ...DEFAULT_QUERY_CONFIG,
  });
};