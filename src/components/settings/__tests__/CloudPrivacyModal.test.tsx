import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CloudPrivacyModal } from '../CloudPrivacyModal';
import { useSettingsStore } from '@/stores/settingsStore';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

const markPrivacyNoticeShown = vi.fn();
const onOpenChange = vi.fn();

function resetStore() {
  useSettingsStore.setState({
    markPrivacyNoticeShown: markPrivacyNoticeShown as never,
  } as never);
}

describe('CloudPrivacyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    mockInvoke.mockResolvedValue(null);
  });

  it('calls onOpenChange(false) on confirm without marking notice when checkbox is unchecked', async () => {
    render(<CloudPrivacyModal open provider="fal" onOpenChange={onOpenChange} />);
    // AlertDialogAction and AlertDialogCancel both use the confirm key; pick the Action
    const actions = screen.getAllByText('inference.privacyModal.confirm');
    fireEvent.click(actions[actions.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(markPrivacyNoticeShown).not.toHaveBeenCalled();
  });

  it('marks the privacy notice and closes when confirm with dontShowAgain checked', () => {
    render(<CloudPrivacyModal open provider="fal" onOpenChange={onOpenChange} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const actions = screen.getAllByText('inference.privacyModal.confirm');
    fireEvent.click(actions[actions.length - 1]);

    expect(markPrivacyNoticeShown).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) from the cancel button', () => {
    render(<CloudPrivacyModal open provider="fal" onOpenChange={onOpenChange} />);
    const cancel = screen.getAllByText('inference.privacyModal.confirm')[0];
    fireEvent.click(cancel);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});