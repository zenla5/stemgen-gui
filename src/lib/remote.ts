/**
 * Remote GPU System for Stemgen-GUI
 * 
 * Allows connecting to a remote GPU server for AI inference.
 * Supports authentication and secure communication.
 */

// Connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Remote server configuration
export interface RemoteServerConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
  useTls?: boolean;
}

// GPU device info from remote server
export interface RemoteGPUDevice {
  id: string;
  name: string;
  memory: number;
  computeCapability: string;
  available: boolean;
}

// Remote server status
export interface RemoteServerStatus {
  connected: boolean;
  latency?: number;
  gpu?: RemoteGPUDevice;
  queueLength?: number;
  maxBatchSize?: number;
}

// Remote inference request
export interface RemoteInferenceRequest {
  id: string;
  audioPath: string;
  model: string;
  outputPath: string;
  options?: {
    stemTypes?: string[];
    overlap?: number;
    device?: string;
  };
}

// Remote inference result
export interface RemoteInferenceResult {
  requestId: string;
  success: boolean;
  stemsPath?: string;
  error?: string;
  processingTime?: number;
}

// Remote server manager interface
export interface RemoteServerManager {
  connect(config: RemoteServerConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): ConnectionStatus;
  getServerStatus(): Promise<RemoteServerStatus>;
  submitJob(request: RemoteInferenceRequest): Promise<string>;
  getJobStatus(jobId: string): Promise<RemoteInferenceResult>;
  cancelJob(jobId: string): Promise<void>;
  listServers(): RemoteServerConfig[];
  testConnection(config: RemoteServerConfig): Promise<RemoteServerStatus>;
}

// API Response types
interface StatusAPIResponse {
  gpu?: RemoteGPUDevice;
  queue_length?: number;
  max_batch_size?: number;
}

interface SubmitAPIResponse {
  job_id: string;
}

// Default configuration
export const DEFAULT_REMOTE_CONFIG: Partial<RemoteServerConfig> = {
  timeout: 30000,
  retryAttempts: 3,
  useTls: true,
};

// Remote manager implementation
export class RemoteServerManagerImpl implements RemoteServerManager {
  private servers = new Map<string, RemoteServerConfig>();
  private currentConnection: string | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusCallback?: (status: ConnectionStatus) => void;
  
  private readonly endpoints = {
    status: '/api/v1/status',
    submit: '/api/v1/inference/submit',
    statusJob: '/api/v1/inference/status',
    cancel: '/api/v1/inference/cancel',
    test: '/api/v1/test',
  };
  
  async connect(config: RemoteServerConfig): Promise<void> {
    const fullConfig = { ...DEFAULT_REMOTE_CONFIG, ...config };
    this.updateStatus('connecting');
    
    try {
      await this.testConnection(fullConfig);
      this.servers.set(config.id, fullConfig);
      this.currentConnection = config.id;
      this.updateStatus('connected');
    } catch (error) {
      this.updateStatus('error');
      throw new Error(`Failed to connect to remote server: ${error}`);
    }
  }
  
  async disconnect(): Promise<void> {
    this.currentConnection = null;
    this.updateStatus('disconnected');
  }
  
  getStatus(): ConnectionStatus {
    return this.status;
  }
  
  async getServerStatus(): Promise<RemoteServerStatus> {
    if (!this.currentConnection) {
      return { connected: false };
    }
    
    const config = this.servers.get(this.currentConnection);
    if (!config) {
      return { connected: false };
    }
    
    try {
      const start = Date.now();
      const response = await this.request<StatusAPIResponse>(config, this.endpoints.status);
      const latency = Date.now() - start;
      
      return {
        connected: true,
        latency,
        gpu: response.gpu,
        queueLength: response.queue_length,
        maxBatchSize: response.max_batch_size,
      };
    } catch {
      return { connected: false };
    }
  }
  
  async submitJob(request: RemoteInferenceRequest): Promise<string> {
    if (!this.currentConnection) {
      throw new Error('Not connected to any remote server');
    }
    
    const config = this.servers.get(this.currentConnection);
    if (!config) {
      throw new Error('Server configuration not found');
    }
    
    const response = await this.request<SubmitAPIResponse>(config, this.endpoints.submit, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    
    return response.job_id;
  }
  
  async getJobStatus(jobId: string): Promise<RemoteInferenceResult> {
    if (!this.currentConnection) {
      throw new Error('Not connected to any remote server');
    }
    
    const config = this.servers.get(this.currentConnection);
    if (!config) {
      throw new Error('Server configuration not found');
    }
    
    return this.request<RemoteInferenceResult>(config, `${this.endpoints.statusJob}/${jobId}`);
  }
  
  async cancelJob(jobId: string): Promise<void> {
    if (!this.currentConnection) {
      throw new Error('Not connected to any remote server');
    }
    
    const config = this.servers.get(this.currentConnection);
    if (!config) {
      throw new Error('Server configuration not found');
    }
    
    await this.request(config, `${this.endpoints.cancel}/${jobId}`, {
      method: 'POST',
    });
  }
  
  listServers(): RemoteServerConfig[] {
    return Array.from(this.servers.values());
  }
  
  async testConnection(config: RemoteServerConfig): Promise<RemoteServerStatus> {
    const fullConfig = { ...DEFAULT_REMOTE_CONFIG, ...config };
    
    try {
      const start = Date.now();
      const response = await this.request<StatusAPIResponse>(fullConfig, this.endpoints.status);
      const latency = Date.now() - start;
      
      return {
        connected: true,
        latency,
        gpu: response.gpu,
        queueLength: response.queue_length,
        maxBatchSize: response.max_batch_size,
      };
    } catch {
      return { connected: false };
    }
  }
  
  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.statusCallback = callback;
  }
  
  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    this.statusCallback?.(status);
  }
  
  private async request<T>(
    config: RemoteServerConfig,
    path: string,
    options?: { method?: string; body?: string }
  ): Promise<T> {
    const url = `${config.url}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: options?.body,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Singleton instance
let remoteManagerInstance: RemoteServerManagerImpl | null = null;

export function getRemoteServerManager(): RemoteServerManager {
  if (!remoteManagerInstance) {
    remoteManagerInstance = new RemoteServerManagerImpl();
  }
  return remoteManagerInstance;
}

// Settings store integration
export interface RemoteSettings {
  enabled: boolean;
  servers: RemoteServerConfig[];
  activeServerId?: string;
  autoReconnect: boolean;
  maxQueueSize: number;
}

// Create remote hook for React components
export function useRemoteGPU() {
  const manager = getRemoteServerManager();
  
  return {
    status: manager.getStatus(),
    servers: manager.listServers(),
    connect: manager.connect.bind(manager),
    disconnect: manager.disconnect.bind(manager),
    getServerStatus: manager.getServerStatus.bind(manager),
    submitJob: manager.submitJob.bind(manager),
    getJobStatus: manager.getJobStatus.bind(manager),
    cancelJob: manager.cancelJob.bind(manager),
    testConnection: manager.testConnection.bind(manager),
  };
}
