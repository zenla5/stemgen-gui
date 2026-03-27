/**
 * First-Run Setup Wizard
 * 
 * Guides users through installing missing dependencies on first launch.
 * Shown when Python, FFmpeg, or AI models are not detected.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import type { PackageStatus } from '@/lib/types';

interface DependencyCheck {
  name: string;
  description: string;
  status: 'pending' | 'checking' | 'ok' | 'missing' | 'warning';
  message?: string;
}

interface FirstRunWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

/** Check a PackageStatus discriminated union and return our dependency check status */
function getDepStatus(pkg: PackageStatus | undefined, successMsg?: string): { status: DependencyCheck['status']; message?: string } {
  if (!pkg) return { status: 'missing', message: 'Not configured' };
  if ('available' in pkg && pkg.available === null) return { status: 'ok', message: successMsg ?? 'Ready' };
  if ('available' in pkg) return { status: 'missing', message: `Status: ${JSON.stringify(pkg)}` };
  if ('unavailable' in pkg) return { status: 'warning', message: pkg.unavailable };
  if ('warning' in pkg) return { status: 'warning', message: pkg.warning };
  if ('missing' in pkg) return { status: 'missing', message: pkg.missing };
  return { status: 'warning', message: 'Unknown status' };
}

export function FirstRunWizard({ onComplete, onSkip }: FirstRunWizardProps) {
  const [step, setStep] = useState<'welcome' | 'check' | 'results' | 'models'>('welcome');
  const [dependencies, setDependencies] = useState<DependencyCheck[]>([
    { name: 'FFmpeg', description: 'Audio/video processing — required', status: 'pending' },
    { name: 'Python', description: 'AI model inference — required', status: 'pending' },
    { name: 'PyTorch', description: 'Machine learning framework — required', status: 'pending' },
    { name: 'demucs', description: 'AI stem separation model — required', status: 'pending' },
    { name: 'CUDA', description: 'GPU acceleration — optional', status: 'pending' },
  ]);

  const updateDependency = (name: string, status: DependencyCheck['status'], message?: string) => {
    setDependencies(prev =>
      prev.map(d => d.name === name ? { ...d, status, message } : d)
    );
  };

  const runDependencyCheck = async () => {
    setStep('check');

    // Check each dependency one by one
    for (const dep of dependencies) {
      updateDependency(dep.name, 'checking');
      await new Promise(r => setTimeout(r, 300)); // brief delay for UX

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const env: any = await invoke('validate_environment');

        if (dep.name === 'FFmpeg') {
          const { status, message } = getDepStatus(env.ffmpeg, 'Found and ready');
          updateDependency(dep.name, status, message);
        } else if (dep.name === 'Python') {
          const { status, message } = getDepStatus(env.python, `v${env.pythonVersion ?? 'unknown'}`);
          updateDependency(dep.name, status, message || 'Python not found');
        } else if (dep.name === 'PyTorch') {
          const { status, message } = getDepStatus(env.pytorch, `v${env.pytorchVersion ?? 'unknown'}`);
          updateDependency(dep.name, status, message || 'PyTorch not installed');
        } else if (dep.name === 'demucs') {
          const { status, message } = getDepStatus(env.demucs, 'Ready');
          updateDependency(dep.name, status, message || 'demucs not installed');
        } else if (dep.name === 'CUDA') {
          const { status, message } = getDepStatus(env.cuda, env.gpuName ?? 'GPU available');
          updateDependency(dep.name, status, message || 'CPU mode — GPU recommended');
        }
      } catch {
        updateDependency(dep.name, 'warning', 'Could not check dependency');
      }
    }

    setStep('results');
  };

  const getStatusIcon = (status: DependencyCheck['status']) => {
    switch (status) {
      case 'ok': return '✅';
      case 'missing': return '❌';
      case 'warning': return '⚠️';
      case 'checking': return '🔄';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: DependencyCheck['status']) => {
    switch (status) {
      case 'ok': return 'text-green-600 dark:text-green-400';
      case 'missing': return 'text-red-600 dark:text-red-400';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400';
      case 'checking': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-500';
    }
  };

  const missingCount = dependencies.filter(d => d.status === 'missing').length;
  const optionalCount = dependencies.filter(d => d.status === 'warning').length;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
          <h1 className="text-2xl font-bold text-white">🎛️ Welcome to Stemgen GUI</h1>
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
                <Button onClick={runDependencyCheck} className="flex-1">
                  Start Check
                </Button>
                <Button variant="outline" onClick={onSkip}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {/* Step: Checking */}
          {step === 'check' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Checking dependencies...</h2>
              <div className="space-y-3">
                {dependencies.map(dep => (
                  <div key={dep.name} className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">{getStatusIcon(dep.status)}</span>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{dep.name}</span>
                        <span className={`text-sm ${getStatusColor(dep.status)}`}>
                          {dep.status === 'checking' ? 'Checking...' : dep.message ?? ''}
                        </span>
                      </div>
                      {dep.status === 'checking' && (
                        <Progress value={0} className="mt-1 h-1 animate-pulse" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Results */}
          {step === 'results' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Dependency Check Complete</h2>
              
              <div className="space-y-2">
                {dependencies.map(dep => (
                  <div key={dep.name} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700">
                    <span className="text-xl mt-0.5">{getStatusIcon(dep.status)}</span>
                    <div>
                      <div className="font-medium text-slate-700 dark:text-slate-300">{dep.name}</div>
                      <div className={`text-sm ${getStatusColor(dep.status)}`}>
                        {dep.message ?? dep.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {missingCount > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">
                    ⚠️ {missingCount} required dependency{missingCount > 1 ? 'ies' : 'y'} missing
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                    Install the missing dependencies, then come back to verify.
                  </p>
                  <div className="space-y-1 text-sm font-mono bg-amber-100 dark:bg-amber-950 p-3 rounded">
                    <div># Install FFmpeg (macOS)</div>
                    <div className="text-amber-600 dark:text-amber-500">brew install ffmpeg</div>
                    <div className="mt-2"># Install FFmpeg (Linux)</div>
                    <div className="text-amber-600 dark:text-amber-500">sudo apt install ffmpeg</div>
                    <div className="mt-2"># Install Python dependencies</div>
                    <div className="text-amber-600 dark:text-amber-500">pip install torch torchaudio demucs</div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="mt-3 w-full"
                    onClick={runDependencyCheck}
                  >
                    Re-check Dependencies
                  </Button>
                </div>
              )}

              {missingCount === 0 && optionalCount > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    ✅ All required dependencies are installed. {optionalCount} optional component{optionalCount > 1 ? 's' : ''} could be improved.
                  </p>
                </div>
              )}

              {missingCount === 0 && optionalCount === 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    ✅ Everything is set up correctly! You're ready to start separating stems.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button onClick={onComplete} className="flex-1">
                  {missingCount === 0 ? 'Start Using Stemgen' : 'Continue Anyway'}
                </Button>
                {missingCount > 0 && (
                  <Button variant="outline" onClick={onSkip}>
                    Skip Setup
                  </Button>
                )}
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
