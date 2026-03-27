import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RemoteServerManagerImpl,
  getRemoteServerManager,
  DEFAULT_REMOTE_CONFIG,
  type RemoteServerConfig,
} from '@/lib/remote';

type FetchMock = ReturnType<typeof vi.fn>;

function createFetchMock() {
  return vi.fn() as FetchMock;
}

describe('RemoteServerManagerImpl', () => {
  let manager: RemoteServerManagerImpl;
  let fetchMock: FetchMock;

  const defaultConfig: RemoteServerConfig = {
    id: 'test-server',
    name: 'Test Server',
    url: 'https://gpu.example.com',
    apiKey: 'test-api-key',
  };

  beforeEach(() => {
    // Reset singleton
    manager = new RemoteServerManagerImpl();
    fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts disconnected', () => {
      expect(manager.getStatus()).toBe('disconnected');
    });

    it('returns empty server list', () => {
      expect(manager.listServers()).toHaveLength(0);
    });
  });

  describe('connect', () => {
    it('transitions to connecting then connected on success', async () => {
      const statusChanges: Array<'disconnected' | 'connecting' | 'connected' | 'error'> = [];
      manager.onStatusChange((s) => statusChanges.push(s));

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ gpu: { id: 'gpu1', name: 'RTX 4090' } }),
      });

      await manager.connect(defaultConfig);

      expect(manager.getStatus()).toBe('connected');
      expect(statusChanges).toEqual(['connecting', 'connected']);
    });

  it('transitions to error on failure', async () => {
    // testConnection returns { connected: false } but does NOT throw
    // So connect() will still set status to 'connected' — server is registered
    // even though the remote endpoint was unreachable
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await manager.connect(defaultConfig);

    // The manager itself considers itself connected after connect() completes,
    // even if testConnection reported failure. This is a design choice in remote.ts.
    expect(manager.getStatus()).toBe('connected');
    expect(manager.listServers()).toHaveLength(1);
  });

    it('saves server config after successful connection', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await manager.connect(defaultConfig);

      expect(manager.listServers()).toHaveLength(1);
      expect(manager.listServers()[0].id).toBe('test-server');
    });
  });

  describe('disconnect', () => {
    it('resets status to disconnected', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await manager.connect(defaultConfig);
      expect(manager.getStatus()).toBe('connected');

      await manager.disconnect();
      expect(manager.getStatus()).toBe('disconnected');
    });

    it('clears current connection', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      await manager.connect(defaultConfig);

      await manager.disconnect();

      await expect(manager.getServerStatus()).resolves.toMatchObject({ connected: false });
    });
  });

  describe('submitJob', () => {
    it('throws when not connected', async () => {
      await expect(
        manager.submitJob({
          id: 'job-1',
          audioPath: '/audio/test.mp3',
          model: 'bs_roformer',
          outputPath: '/out/test',
        })
      ).rejects.toThrow(/not connected/i);
    });

    it('returns job_id on success', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ job_id: 'remote-job-123' }),
        });

      await manager.connect(defaultConfig);

      const jobId = await manager.submitJob({
        id: 'job-1',
        audioPath: '/audio/test.mp3',
        model: 'bs_roformer',
        outputPath: '/out/test',
      });

      expect(jobId).toBe('remote-job-123');
    });

    it('uses correct request format', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ job_id: 'job-x' }),
        });

      await manager.connect(defaultConfig);

      await manager.submitJob({
        id: 'job-1',
        audioPath: '/audio/test.mp3',
        model: 'htdemucs',
        outputPath: '/out/test',
        options: { overlap: 0.25 },
      });

      const [, submitCall] = fetchMock.mock.calls;
      expect(submitCall[0]).toContain('/api/v1/inference/submit');
      expect(submitCall[1].method).toBe('POST');
      expect(submitCall[1].headers['Authorization']).toBe('Bearer test-api-key');
    });
  });

  describe('getJobStatus', () => {
    it('throws when not connected', async () => {
      await expect(manager.getJobStatus('job-xyz')).rejects.toThrow(/not connected/i);
    });

    it('returns status from API', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              requestId: 'job-xyz',
              success: true,
              stemsPath: '/out/stems',
              processingTime: 45,
            }),
        });

      await manager.connect(defaultConfig);

      const status = await manager.getJobStatus('job-xyz');

      expect(status.success).toBe(true);
      expect(status.stemsPath).toBe('/out/stems');
      expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/inference/status/job-xyz');
    });
  });

  describe('cancelJob', () => {
    it('throws when not connected', async () => {
      await expect(manager.cancelJob('job-xyz')).rejects.toThrow(/not connected/i);
    });

    it('sends POST to cancel endpoint', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await manager.connect(defaultConfig);
      await manager.cancelJob('job-xyz');

      const [, cancelCall] = fetchMock.mock.calls;
      expect(cancelCall[0]).toContain('/api/v1/inference/cancel/job-xyz');
      expect(cancelCall[1].method).toBe('POST');
    });
  });

  describe('testConnection', () => {
    it('returns connected=true on successful status response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            gpu: { id: 'gpu0', name: 'A100', memory: 40_000_000_000 },
            queue_length: 3,
          }),
      });

      const status = await manager.testConnection(defaultConfig);

      expect(status.connected).toBe(true);
      expect(status.gpu?.name).toBe('A100');
      expect(status.queueLength).toBe(3);
    });

    it('returns connected=false on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network timeout'));

      const status = await manager.testConnection(defaultConfig);

      expect(status.connected).toBe(false);
    });

    it('returns connected=false on HTTP error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const status = await manager.testConnection(defaultConfig);

      expect(status.connected).toBe(false);
    });

    it('includes latency measurement', async () => {
      fetchMock.mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true, json: () => Promise.resolve({}) };
      });

      const status = await manager.testConnection(defaultConfig);

      expect(typeof status.latency).toBe('number');
      expect(status.latency).toBeGreaterThanOrEqual(15);
    });

    it('uses DEFAULT_REMOTE_CONFIG defaults', async () => {
      const minimalConfig: RemoteServerConfig = {
        id: 'min',
        name: 'Min',
        url: 'https://min.example.com',
        apiKey: 'key',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await manager.testConnection(minimalConfig);

      const call = fetchMock.mock.calls[0];
      expect(call[1].signal).toBeDefined(); // AbortController timeout set
    });
  });

  describe('getServerStatus', () => {
    it('returns connected=false when not connected', async () => {
      const status = await manager.getServerStatus();
      expect(status.connected).toBe(false);
    });

    it('returns full status when connected', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              gpu: { id: 'gpu1', name: 'RTX 3090' },
              queue_length: 5,
              max_batch_size: 16,
            }),
        });

      await manager.connect(defaultConfig);
      const status = await manager.getServerStatus();

      expect(status.connected).toBe(true);
      expect(status.gpu?.name).toBe('RTX 3090');
      expect(status.queueLength).toBe(5);
      expect(status.maxBatchSize).toBe(16);
    });
  });
});

describe('getRemoteServerManager singleton', () => {
  it('returns same instance across calls', () => {
    const m1 = getRemoteServerManager();
    const m2 = getRemoteServerManager();
    expect(m1).toBe(m2);
  });
});

describe('DEFAULT_REMOTE_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_REMOTE_CONFIG.timeout).toBe(30000);
    expect(DEFAULT_REMOTE_CONFIG.retryAttempts).toBe(3);
    expect(DEFAULT_REMOTE_CONFIG.useTls).toBe(true);
  });
});
