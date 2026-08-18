/**
 * First-Run Setup Wizard
 *
 * Guides users through installing missing dependencies on first launch.
 * Shown when Python, FFmpeg, or AI models are not detected.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DependencyCheckPanel } from '@/components/setup/DependencyCheckPanel';

interface FirstRunWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function FirstRunWizard({ onComplete, onSkip }: FirstRunWizardProps) {
  const [step, setStep] = useState<'welcome' | 'check' | 'results'>('welcome');

  const handleStartCheck = () => {
    setStep('check');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
          <h1 data-testid="wizard-step" className="text-2xl font-bold text-white">Welcome to Stemgen GUI</h1>
          <p className="text-indigo-100 mt-1">Let's get you set up for stem separation</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                Before you can separate audio into stems, we need to verify a few
                dependencies are installed on your system.
              </p>
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">What we need:</h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>🔧 <strong>FFmpeg</strong> — for audio processing and encoding</li>
                  <li>🐍 <strong>Python 3.9+</strong> — for AI model inference</li>
                  <li>🧠 <strong>PyTorch + demucs</strong> — for stem separation</li>
                  <li>🎮 <strong>CUDA</strong> (optional) — for GPU acceleration</li>
                </ul>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleStartCheck} className="flex-1">
                  Start Check
                </Button>
                <Button data-testid="wizard-skip" variant="outline" onClick={onSkip}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {/* Step: Check — DependencyCheckPanel handles the full lifecycle */}
          {step === 'check' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Checking dependencies...</h2>
              <DependencyCheckPanel
                autoCheckOnMount
                showCheckButton={false}
                onCheckComplete={() => setStep('results')}
              />
            </div>
          )}

          {/* Step: Results — panel has already completed its check */}
          {step === 'results' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Dependency Check Complete</h2>
              <DependencyCheckPanel
                autoCheckOnMount={false}
                showCheckButton={false}
                onAllDependenciesOk={onComplete}
              />
              <div className="flex gap-3 pt-2">
                <Button data-testid="wizard-complete" onClick={onComplete} className="flex-1">
                  Continue
                </Button>
                <Button variant="outline" onClick={onSkip}>
                  Skip Setup
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            You can re-run this check anytime from Settings → System
          </p>
        </div>
      </div>
    </div>
  );
}