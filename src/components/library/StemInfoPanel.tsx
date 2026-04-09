/**
 * Stem Info Panel Component
 *
 * Displays detailed provenance metadata for a selected stem file.
 * Sections: Separation, Toolchain, Source, Export, Job, User Notes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/Button';
import {
  AlertCircle,
  CheckCircle,
  Copy,
  Database,
  FileAudio,
  History,
  Info,
  Loader2,
  Package,
  Save,
  Settings,
  Tag,
  XCircle,
} from 'lucide-react';
import type { StemProvenance, StalenessReport } from '@/lib/types/library';
import {
  formatTimestamp,
  formatDuration,
  formatFileSize,
  formatBitdepth,
  getStalenessReasonDescription,
  isStemCurrent,
  isStemStale,
  isStemUnknown,
} from '@/lib/types/library';

interface StemInfoPanelProps {
  stemPath: string;
}

export function StemInfoPanel({ stemPath }: StemInfoPanelProps) {
  const [provenance, setProvenance] = useState<StemProvenance | null>(null);
  const [stalenessReport] = useState<StalenessReport | null>(null);
  const [userNotes, setUserNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<'checking' | 'ok' | 'modified' | 'missing'>('checking');
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  // Load provenance and staleness data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        // Load provenance
        const prov = await invoke<StemProvenance | null>('read_stem_provenance', { stemPath });
        setProvenance(prov);

        // Check integrity
        if (prov) {
          const isValid = await invoke<boolean>('verify_stem_integrity', { stemPath });
          setIntegrityStatus(isValid ? 'ok' : 'modified');
        } else {
          setIntegrityStatus('missing');
        }

        // Load user notes
        const notes = await invoke<string | null>('read_stem_notes', { stemPath }).catch(() => null);
        setUserNotes(notes ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [stemPath]);

  // Save user notes
  const handleSaveNotes = useCallback(async () => {
    setIsSavingNotes(true);
    try {
      await invoke('save_user_notes', { stemPath, notes: userNotes });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSavingNotes(false);
    }
  }, [stemPath, userNotes]);

  // Get integrity icon
  const IntegrityIcon = () => {
    switch (integrityStatus) {
      case 'ok':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'modified':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'missing':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  // Get staleness badge
  const StalenessBadge = () => {
    if (!stalenessReport) return null;

    if (isStemCurrent(stalenessReport.status)) {
      return <span className="inline-flex items-center rounded-full bg-green-500 px-2 py-1 text-xs font-medium text-white">{t('library.current')}</span>;
    }
    if (isStemStale(stalenessReport.status)) {
      return <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-1 text-xs font-medium text-white">{t('library.outdated')}</span>;
    }
    if (isStemUnknown(stalenessReport.status)) {
      return <span className="inline-flex items-center rounded-full bg-gray-500 px-2 py-1 text-xs font-medium text-white">{t('library.unknown')}</span>;
    }
    return null;
  };

  // Copy button component
  const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 w-6 p-0">
        {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight text-destructive">
            <AlertCircle className="h-5 w-5" />
            {t('library.errorLoadingStemInfo')}
          </h3>
        </div>
        <div className="p-6 pt-0">
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6 pb-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <Info className="h-5 w-5" />
            {t('library.stemInformation')}
          </h3>
          <div className="flex items-center gap-2">
            <StalenessBadge />
            <div className="flex items-center gap-1">
              <IntegrityIcon />
              <span className="text-sm text-muted-foreground">
                {integrityStatus === 'ok' && t('library.sourceVerified')}
                {integrityStatus === 'modified' && t('library.sourceModified')}
                {integrityStatus === 'missing' && t('library.sourceMissing')}
                {integrityStatus === 'checking' && t('library.checking')}
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground truncate" title={stemPath}>
          {stemPath.split(/[/\\]/).pop()}
        </p>

        {/* Staleness reasons */}
        {stalenessReport && isStemStale(stalenessReport.status) && (
          <div className="mt-2 space-y-1">
            {stalenessReport.status.reasons.map((reason, i) => (
              <p key={i} className="text-xs text-yellow-600">
                {getStalenessReasonDescription(reason)}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 pt-0 space-y-6">
        {provenance ? (
          <>
            {/* SEPARATION section */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('library.separation')}
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <InfoRow label={t('library.model')} value={provenance.separation_model} />
                    {provenance.model_version && (
                      <InfoRow
                        label={t('library.version')}
                        value={
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {provenance.model_version}
                            </code>
                            <CopyButton text={provenance.model_version} />
                          </div>
                        }
                      />
                    )}
                    {provenance.model_family && (
                      <InfoRow label={t('library.modelFamily')} value={provenance.model_family} />
                    )}
                    {provenance.device && (
                      <InfoRow label={t('library.device')} value={provenance.device.toUpperCase()} />
                    )}
                    {provenance.separation_duration_secs != null && (
                      <InfoRow
                        label={t('library.duration')}
                        value={formatDuration(provenance.separation_duration_secs)}
                      />
                    )}
                    {provenance.separation_quality_preset && (
                      <InfoRow
                        label={t('library.qualityPreset')}
                        value={
                          <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium">
                            {provenance.separation_quality_preset}
                          </span>
                        }
                      />
                    )}
                    <InfoRow label={t('library.createdAt')} value={formatTimestamp(provenance.separation_timestamp)} />
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* TOOLCHAIN section */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('library.toolchain')}
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <InfoRow label={t('library.stemgenGui')} value={provenance.stemgen_gui_version} />
                    {provenance.stemgen_version && (
                      <InfoRow label={t('library.stemgen')} value={provenance.stemgen_version} />
                    )}
                    {provenance.ffmpeg_version && (
                      <InfoRow label={t('library.ffmpeg')} value={provenance.ffmpeg_version} />
                    )}
                    {provenance.os_info && <InfoRow label={t('library.os')} value={provenance.os_info} />}
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* SOURCE section */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileAudio className="h-4 w-4" />
                {t('library.source')}
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <InfoRow
                      label={t('library.path')}
                      value={
                        <div className="flex items-center gap-2 max-w-[300px]">
                          <span className="truncate" title={provenance.source_path}>
                            {provenance.source_path}
                          </span>
                          <CopyButton text={provenance.source_path} />
                        </div>
                      }
                    />
                    <InfoRow
                      label={t('library.sha256')}
                      value={
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded truncate max-w-[200px]">
                            {provenance.source_content_hash}
                          </code>
                          <CopyButton text={provenance.source_content_hash} />
                        </div>
                      }
                    />
                    {provenance.source_format && (
                      <InfoRow label={t('library.format')} value={provenance.source_format.toUpperCase()} />
                    )}
                    <InfoRow
                      label={t('library.sampleRate')}
                      value={`${provenance.source_sample_rate.toLocaleString()} Hz`}
                    />
                    {provenance.source_bitdepth != null && (
                      <InfoRow label={t('library.bitDepth')} value={formatBitdepth(provenance.source_bitdepth)} />
                    )}
                    {provenance.source_size_bytes != null && (
                      <InfoRow label={t('library.size')} value={formatFileSize(provenance.source_size_bytes)} />
                    )}
                    <InfoRow
                      label={t('library.duration')}
                      value={formatDuration(provenance.source_duration_secs)}
                    />
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* EXPORT section */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                {t('library.export')}
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    {provenance.export_codec && (
                      <InfoRow
                        label={t('library.codec')}
                        value={provenance.export_codec.toUpperCase()}
                      />
                    )}
                    {provenance.export_dj_preset && (
                      <InfoRow
                        label={t('library.djPreset')}
                        value={
                          <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium">
                            {provenance.export_dj_preset}
                          </span>
                        }
                      />
                    )}
                    {!provenance.export_codec && !provenance.export_dj_preset && (
                      <tr>
                        <td className="p-3 text-muted-foreground" colSpan={2}>
                          {t('library.noExportMetadata')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* JOB section */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('library.job')}
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <InfoRow
                      label={t('library.jobId')}
                      value={
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.job_id}
                          </code>
                          <CopyButton text={provenance.job_id} />
                        </div>
                      }
                    />
                    {provenance.batch_id && (
                      <InfoRow
                        label={t('library.batchId')}
                        value={
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.batch_id}
                          </code>
                        }
                      />
                    )}
                    <InfoRow label={t('library.schema')} value={String(provenance.schema_version)} />
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* User Notes */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {t('library.userNotes')}
              </h3>
              <div className="space-y-2">
                <textarea
                  value={userNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUserNotes(e.target.value)}
                  placeholder={t('library.notesPlaceholder')}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                  >
                    {isSavingNotes ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {t('library.saveNotes')}
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t('library.noProvenance')}</p>
            <p className="text-sm text-muted-foreground">
              {t('library.noProvenanceDescription')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="p-3 text-muted-foreground whitespace-nowrap">{label}</td>
      <td className="p-3 font-medium">{value}</td>
    </tr>
  );
}

export default StemInfoPanel;
