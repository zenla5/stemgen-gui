import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { InstallProgress } from '../InstallProgress';

describe('InstallProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a running state with loader text', () => {
    const { container } = render(
      <InstallProgress lines={['echo']} isRunning result={null} />
    );
    expect(container.textContent).toContain('Installing...');
  });

  it('renders log lines when present', () => {
    const { container } = render(
      <InstallProgress lines={['first', 'second']} isRunning={false} result={{ success: true, alreadyInstalled: false }} />
    );
    expect(container.textContent).toContain('first');
    expect(container.textContent).toContain('second');
  });

  it('renders the success state', () => {
    const { container } = render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: true, alreadyInstalled: false }} />
    );
    expect(container.textContent).toContain('Installation complete');
  });

  it('renders the already-installed state', () => {
    const { container } = render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: true, alreadyInstalled: true }} />
    );
    expect(container.textContent).toContain('Already installed');
  });

  it('renders the failure state', () => {
    const { container } = render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: false, alreadyInstalled: false }} />
    );
    expect(container.textContent).toContain('Installation failed');
  });

  it('renders an error message on failure', () => {
    const { container } = render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: false, alreadyInstalled: false, error: 'boom' }} />
    );
    expect(container.textContent).toContain('boom');
  });

  it('invokes onComplete when a result arrives', () => {
    const onComplete = vi.fn();
    render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: true, alreadyInstalled: false }} onComplete={onComplete} />
    );
    expect(onComplete).toHaveBeenCalled();
  });

  it('shows the copy button only when a command display is provided', () => {
    const withCmd = render(
      <InstallProgress lines={[]} isRunning={false} commandDisplay="ffmpeg" result={{ success: true, alreadyInstalled: false }} />
    );
    expect(withCmd.container.textContent).toContain('Copy');
    const withoutCmd = render(
      <InstallProgress lines={[]} isRunning={false} result={{ success: true, alreadyInstalled: false }} />
    );
    expect(withoutCmd.container.textContent).not.toContain('Copy');
  });

  it('copies the command to the clipboard on click', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(
      <InstallProgress lines={[]} isRunning={false} commandDisplay="ffmpeg -i x" result={{ success: true, alreadyInstalled: false }} />
    );
    const copyButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'));
    copyButton?.click();
    expect(writeText).toHaveBeenCalledWith('ffmpeg -i x');
  });

  it('copies the full diagnostic output (command + log + error) on failure', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(
      <InstallProgress
        lines={['Python path configuration:', 'Fatal Python error: Failed to import encodings module', 'ModuleNotFoundError: No module named encodings']}
        isRunning={false}
        commandDisplay="python3 -m pip install --user torch torchaudio"
        result={{ success: false, alreadyInstalled: false, error: 'Installation failed with exit code Some(1)' }}
      />
    );
    const copyButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'));
    copyButton?.click();
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toContain('python3 -m pip install --user torch torchaudio');
    expect(payload).toContain('Fatal Python error: Failed to import encodings module');
    expect(payload).toContain('ModuleNotFoundError: No module named encodings');
    expect(payload).toContain('Installation failed with exit code Some(1)');
    expect(payload).not.toBe('python3 -m pip install --user torch torchaudio');
  });

  it('copies command + error when there are no log lines on failure', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(
      <InstallProgress
        lines={[]}
        isRunning={false}
        commandDisplay="python3 -m pip install --user torch torchaudio"
        result={{ success: false, alreadyInstalled: false, error: 'boom' }}
      />
    );
    const copyButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'));
    copyButton?.click();
    const payload = writeText.mock.calls[0][0] as string;
    expect(payload).toContain('python3 -m pip install --user torch torchaudio');
    expect(payload).toContain('boom');
  });

  it('copies only the command while running (no full output)', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { container } = render(
      <InstallProgress
        lines={['some streaming output']}
        isRunning
        commandDisplay="python3 -m pip install --user torch torchaudio"
        result={null}
      />
    );
    const copyButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'));
    copyButton?.click();
    expect(writeText).toHaveBeenCalledWith('python3 -m pip install --user torch torchaudio');
  });

  it('shows the cancel button only while running with onCancel', () => {
    const withCancel = render(
      <InstallProgress lines={[]} isRunning onCancel={vi.fn()} result={null} />
    );
    expect(withCancel.container.textContent).toContain('Cancel');
    const withoutCancel = render(
      <InstallProgress lines={[]} isRunning result={null} />
    );
    expect(withoutCancel.container.textContent).not.toContain('Cancel');
  });

  it('shows the copied state after copying then resets', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();
    const { container } = render(
      <InstallProgress
        lines={[]}
        isRunning={false}
        commandDisplay="ffmpeg -i x"
        result={{ success: true, alreadyInstalled: false }}
      />
    );
    const copyButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Copy')
    );
    copyButton?.click();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Copied');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).not.toContain('Copied');
  });

  it('formats elapsed time in minutes once over a minute', () => {
    vi.useFakeTimers();
    const { container } = render(
      <InstallProgress lines={[]} isRunning result={null} />
    );
    expect(container.textContent).toContain('0s');
    act(() => {
      vi.advanceTimersByTime(65000);
    });
    expect(container.textContent).toContain('1m 5s');
  });
});
