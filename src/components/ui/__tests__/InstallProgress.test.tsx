import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { InstallProgress } from '../InstallProgress';

describe('InstallProgress', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
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
});