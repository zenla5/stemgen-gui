import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/AlertDialog';
import { useSettingsStore } from '@/stores/settingsStore';

interface CloudPrivacyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'fal' | 'replicate';
}

export function CloudPrivacyModal({ open, onOpenChange, provider }: CloudPrivacyModalProps) {
  const { t } = useTranslation();
  const { markPrivacyNoticeShown } = useSettingsStore();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const policyUrl = provider === 'fal' ? 'https://fal.ai/privacy' : 'https://replicate.com/privacy';
  const providerName = provider === 'fal' ? 'fal.ai' : 'Replicate';

  const handleConfirm = async () => {
    if (dontShowAgain) {
      await markPrivacyNoticeShown();
    }
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('inference.privacyModal.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('inference.privacyModal.body', { provider: providerName, policyUrl })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 py-2">
          <input
            type="checkbox"
            id="dont-show-again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="dont-show-again" className="text-sm cursor-pointer">
            {t('inference.privacyModal.dontShowAgain')}
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            {t('inference.privacyModal.confirm')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            {t('inference.privacyModal.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
