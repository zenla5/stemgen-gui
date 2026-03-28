/**
 * Stem Info Panel Component
 * 
 * Displays detailed provenance metadata for a selected stem file.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Copy,
  Database,
  FileAudio,
  Hash,
  History,
  Info,
  Loader2,
  Save,
  Shield,
  Tag,
  User,
  XCircle,
} from 'lucide-react';
import type { StemProvenance, StalenessReport } from '@/lib/types/library';
import { formatFileSize, formatTimestamp, getStalenessReasonDescription, isStemCurrent, isStemStale, isStemUnknown } from '@/lib/types/library';
import { useLibraryStore } from '@/stores/libraryStore';

interface StemInfoPanelProps {
  stemPath: string;
  onClose?: () => void;
}

export function StemInfoPanel({ stemPath, onClose }: StemInfoPanelProps) {
  const [provenance, setProvenance] = useState<StemProvenance | null>(null);
  const [stalenessReport, setStalenessReport] = useState<StalenessReport | null>(null);
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

  // Copy field to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

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
      return <Badge variant="default" className="bg-green-500">Current</Badge>;
    }
    if (isStemStale(stalenessReport.status)) {
      return <Badge variant="destructive">Stale</Badge>;
    }
    if (isStemUnknown(stalenessReport.status)) {
      return <Badge variant="secondary">Unknown</Badge>;
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Error Loading Stem Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Stem Information
            </CardTitle>
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
        </CardHeader>
        
        <CardContent className="space-y-6">
          {provenance ? (
            <>
              {/* Model Information */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Separation Model
                </h3>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Model</TableCell>
                      <TableCell className="font-medium">{provenance.separation_model}</TableCell>
                    </TableRow>
                    {provenance.model_version && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Version</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {provenance.model_version}
                            </code>
                            <CopyButton text={provenance.model_version} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {provenance.stemgen_version && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">stemgen Version</TableCell>
                        <TableCell className="font-medium">{provenance.stemgen_version}</TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="text-muted-foreground">stemgen-gui Version</TableCell>
                      <TableCell className="font-medium">{provenance.stemgen_gui_version}</TableCell>
                    </TableRow>
                    {provenance.separation_quality_preset && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Quality Preset</TableCell>
                        <TableCell className="font-medium">
                          <Badge variant="outline">{provenance.separation_quality_preset}</Badge>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </section>

              <Separator />

              {/* Source Information */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileAudio className="h-4 w-4" />
                  Source File
                </h3>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Path</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 max-w-[300px]">
                          <span className="truncate" title={provenance.source_path}>
                            {provenance.source_path}
                          </span>
                          <CopyButton text={provenance.source_path} />
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Content Hash</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded truncate max-w-[200px]">
                            {provenance.source_content_hash}
                          </code>
                          <CopyButton text={provenance.source_content_hash} />
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Duration</TableCell>
                      <TableCell className="font-medium">
                        {provenance.source_duration_secs.toFixed(1)} seconds
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Sample Rate</TableCell>
                      <TableCell className="font-medium">
                        {provenance.source_sample_rate.toLocaleString()} Hz
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </section>

              <Separator />

              {/* Job Information */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Job Information
                </h3>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Job ID</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.job_id}
                          </code>
                          <CopyButton text={provenance.job_id} />
                        </div>
                      </TableCell>
                    </TableRow>
                    {provenance.batch_id && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Batch ID</TableCell>
                        <TableCell className="font-medium">
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {provenance.batch_id}
                          </code>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="text-muted-foreground">Separation Time</TableCell>
                      <TableCell className="font-medium">
                        {formatTimestamp(provenance.separation_timestamp)}
                      </TableCell>
                    </TableRow>
                    {provenance.schema_version && (
                      <TableRow>
                        <TableCell className="text-muted-foreground">Schema Version</TableCell>
                        <TableCell className="font-medium">{provenance.schema_version}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </section>

              <Separator />

              {/* User Notes */}
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  User Notes
                </h3>
                <div className="space-y-2">
                  <Textarea
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    placeholder="Add personal notes about this stem..."
                    className="min-h-[100px]"
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
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 w-6 p-0">
          {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{copied ? 'Copied!' : 'Copy to clipboard'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default StemInfoPanel;
