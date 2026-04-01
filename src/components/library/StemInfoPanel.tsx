/**
 * Stem Info Panel Component
 * 
 * Displays detailed provenance metadata for a selected stem file.
 */

import { useState, useEffect, useCallback } from 'react';
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
  Save,
  Tag,
  XCircle,
} from 'lucide-react';
import type { StemProvenance, StalenessReport } from '@/lib/types/library';
import { formatTimestamp, isStemCurrent, isStemStale, isStemUnknown } from '@/lib/types/library';

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
      return <span className="inline-flex items-center rounded-full bg-green-500 px-2 py-1 text-xs font-medium text-white">Current</span>;
    }
    if (isStemStale(stalenessReport.status)) {
      return <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-1 text-xs font-medium text-white">Stale</span>;
    }
    if (isStemUnknown(stalenessReport.status)) {
      return <span className="inline-flex items-center rounded-full bg-gray-500 px-2 py-1 text-xs font-medium text-white">Unknown</span>;
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
            Error Loading Stem Info
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
            Stem Information
          </h3>
          <div className="flex items-center gap-2">
            <StalenessBadge />
            <div className="flex items-center gap-1">
              <IntegrityIcon />
              <span className="text-sm text-muted-foreground">
                {integrityStatus === 'ok' && 'Source Verified'}
                {integrityStatus === 'modified' && 'Source Modified'}
                {integrityStatus === 'missing' && 'Source Missing'}
                {integrityStatus === 'checking' && 'Checking...'}
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground truncate" title={stemPath}>
          {stemPath.split(/[/\\]/).pop()}
        </p>
      </div>
      
      <div className="p-6 pt-0 space-y-6">
        {provenance ? (
          <>
            {/* Model Information */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Separation Model
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Model</td>
                      <td className="p-3 font-medium">{provenance.separation_model}</td>
                    </tr>
                    {provenance.model_version && (
                      <tr className="border-b">
                        <td className="p-3 text-muted-foreground">Version</td>
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {provenance.model_version}
                            </code>
                            <CopyButton text={provenance.model_version} />
                          </div>
                        </td>
                      </tr>
                    )}
                    {provenance.stemgen_version && (
                      <tr className="border-b">
                        <td className="p-3 text-muted-foreground">stemgen Version</td>
                        <td className="p-3 font-medium">{provenance.stemgen_version}</td>
                      </tr>
                    )}
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">stemgen-gui Version</td>
                      <td className="p-3 font-medium">{provenance.stemgen_gui_version}</td>
                    </tr>
                    {provenance.separation_quality_preset && (
                      <tr>
                        <td className="p-3 text-muted-foreground">Quality Preset</td>
                        <td className="p-3 font-medium">
                          <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium">
                            {provenance.separation_quality_preset}
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* Source Information */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileAudio className="h-4 w-4" />
                Source File
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Path</td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2 max-w-[300px]">
                          <span className="truncate" title={provenance.source_path}>
                            {provenance.source_path}
                          </span>
                          <CopyButton text={provenance.source_path} />
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Content Hash</td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded truncate max-w-[200px]">
                            {provenance.source_content_hash}
                          </code>
                          <CopyButton text={provenance.source_content_hash} />
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Duration</td>
                      <td className="p-3 font-medium">
                        {provenance.source_duration_secs.toFixed(1)} seconds
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 text-muted-foreground">Sample Rate</td>
                      <td className="p-3 font-medium">
                        {provenance.source_sample_rate.toLocaleString()} Hz
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* Job Information */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <History className="h-4 w-4" />
                Job Information
              </h3>
              <div className="rounded-md border">
                <table className="w-full">
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Job ID</td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.job_id}
                          </code>
                          <CopyButton text={provenance.job_id} />
                        </div>
                      </td>
                    </tr>
                    {provenance.batch_id && (
                      <tr className="border-b">
                        <td className="p-3 text-muted-foreground">Batch ID</td>
                        <td className="p-3 font-medium">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.batch_id}
                          </code>
                        </td>
                      </tr>
                    )}
                    <tr className="border-b">
                      <td className="p-3 text-muted-foreground">Separation Time</td>
                      <td className="p-3 font-medium">
                        {formatTimestamp(provenance.separation_timestamp)}
                      </td>
                    </tr>
                    {provenance.schema_version && (
                      <tr>
                        <td className="p-3 text-muted-foreground">Schema Version</td>
                        <td className="p-3 font-medium">{provenance.schema_version}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <hr className="border-t" />

            {/* User Notes */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                User Notes
              </h3>
              <div className="space-y-2">
                <textarea
                  value={userNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUserNotes(e.target.value)}
                  placeholder="Add personal notes about this stem..."
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
                    Save Notes
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No provenance metadata found</p>
            <p className="text-sm text-muted-foreground">
              This stem file may have been created with an older version of stemgen-gui.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StemInfoPanel;