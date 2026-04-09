import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useLibraryStore } from '@/stores/libraryStore';
import { Button } from '@/components/ui/Button';
import { formatTimestamp } from '@/lib/types/library';
import type { LibraryRoot, StalenessRules } from '@/lib/types/library';
import { Plus, RefreshCw, Edit, Trash2, FolderOpen, X } from 'lucide-react';

interface LibraryRootSettingsProps {
  onClose: () => void;
}

interface EditForm {
  output_strategy: 'alongside' | 'mirrored' | 'flat';
  mirrored_path: string;
  flat_path: string;
}

const DEFAULT_STALENESS: StalenessRules = {
  check_source_modified: true,
  check_model_outdated: true,
  check_parameters_changed: false,
  flag_unknown_provenance: false,
};

function parseStalenessPolicy(raw: string | undefined): StalenessRules {
  if (!raw) return { ...DEFAULT_STALENESS };
  try {
    const parsed = JSON.parse(raw) as Partial<StalenessRules>;
    return { ...DEFAULT_STALENESS, ...parsed };
  } catch {
    return { ...DEFAULT_STALENESS };
  }
}

function parseIgnoredGlobs(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.join('\n') : '';
  } catch {
    return '';
  }
}

export function LibraryRootSettings({ onClose }: LibraryRootSettingsProps) {
  const {
    libraryRoots,
    isScanning,
    loadLibraryRoots,
    addLibraryRoot,
    updateLibraryRoot,
    deleteLibraryRoot,
    scanLibraryRoot,
  } = useLibraryStore();

  const [editingRootId, setEditingRootId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [scanningRootId, setScanningRootId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    output_strategy: 'alongside',
    mirrored_path: '',
    flat_path: '',
  });
  const [stalenessForm, setStalenessForm] = useState<StalenessRules>({ ...DEFAULT_STALENESS });
  const [globsText, setGlobsText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadLibraryRoots();
  }, [loadLibraryRoots]);

  const startEditing = (root: LibraryRoot) => {
    setEditingRootId(root.id);
    setDeleteConfirmId(null);
    setSaveError(null);
    setEditForm({
      output_strategy: root.output_strategy,
      mirrored_path: root.mirrored_path ?? '',
      flat_path: root.flat_path ?? '',
    });
    setStalenessForm(parseStalenessPolicy(root.staleness_policy));
    setGlobsText(parseIgnoredGlobs(root.ignored_globs));
  };

  const cancelEditing = () => {
    setEditingRootId(null);
    setSaveError(null);
  };

  const handleAddRoot = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Library Root Folder',
    });
    if (selected && typeof selected === 'string') {
      await addLibraryRoot(selected, 'alongside');
    }
  };

  const handleScan = async (rootId: string) => {
    setScanningRootId(rootId);
    try {
      await scanLibraryRoot(rootId, true);
    } finally {
      setScanningRootId(null);
    }
  };

  const handleConfirmDelete = async (rootId: string) => {
    setDeleteConfirmId(null);
    if (editingRootId === rootId) {
      setEditingRootId(null);
    }
    await deleteLibraryRoot(rootId);
  };

  const handlePickFolder = async (field: 'mirrored_path' | 'flat_path') => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select target folder',
    });
    if (selected && typeof selected === 'string') {
      setEditForm((prev) => ({ ...prev, [field]: selected }));
    }
  };

  const handleSave = async () => {
    if (!editingRootId) return;
    setSaveError(null);
    try {
      const globsArray = globsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateLibraryRoot(editingRootId, {
        output_strategy: editForm.output_strategy,
        mirrored_path:
          editForm.output_strategy === 'mirrored' ? editForm.mirrored_path : undefined,
        flat_path: editForm.output_strategy === 'flat' ? editForm.flat_path : undefined,
        staleness_policy: JSON.stringify(stalenessForm),
        ignored_globs: JSON.stringify(globsArray),
      });
      setEditingRootId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="border-t p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Library Roots
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAddRoot} data-testid="add-root-btn">
            <Plus className="h-3 w-3 mr-1" />
            Add Root
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close settings">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {libraryRoots.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No library roots configured.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleAddRoot}
            data-testid="empty-add-root-btn"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add your first library folder
          </Button>
        </div>
      )}

      {/* Root list */}
      {libraryRoots.map((root) => (
        <div key={root.id} className="rounded-md border p-3 space-y-3" data-testid={`root-${root.id}`}>
          {/* Root header row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate" title={root.path}>
                {root.path}
              </span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                {root.output_strategy}
              </span>
              {root.last_scanned_at && (
                <span className="text-xs text-muted-foreground">
                  Scanned {formatTimestamp(root.last_scanned_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleScan(root.id)}
                disabled={isScanning}
                aria-label="Scan now"
                data-testid={`scan-${root.id}`}
              >
                <RefreshCw
                  className={`h-3 w-3 ${scanningRootId === root.id ? 'animate-spin' : ''}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startEditing(root)}
                aria-label="Edit root"
                data-testid={`edit-${root.id}`}
              >
                <Edit className="h-3 w-3" />
              </Button>
              {deleteConfirmId === root.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleConfirmDelete(root.id)}
                    data-testid={`confirm-delete-${root.id}`}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(null)}
                    data-testid={`cancel-delete-${root.id}`}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmId(root.id)}
                  aria-label="Delete root"
                  data-testid={`delete-${root.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Expanded edit form */}
          {editingRootId === root.id && (
            <div className="space-y-4 border-t pt-3">
              {saveError && (
                <p className="text-sm text-destructive" data-testid="save-error">
                  {saveError}
                </p>
              )}

              {/* Output strategy */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Output Strategy
                </label>
                <select
                  value={editForm.output_strategy}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      output_strategy: e.target.value as EditForm['output_strategy'],
                    }))
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="output-strategy-select"
                >
                  <option value="alongside">Alongside (next to source)</option>
                  <option value="mirrored">Mirrored (mirror structure)</option>
                  <option value="flat">Flat (all in one folder)</option>
                </select>
              </div>

              {/* Mirrored path */}
              {editForm.output_strategy === 'mirrored' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Mirrored Path
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editForm.mirrored_path}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, mirrored_path: e.target.value }))
                      }
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Select target folder..."
                      data-testid="mirrored-path-input"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePickFolder('mirrored_path')}
                    >
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Flat path */}
              {editForm.output_strategy === 'flat' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Flat Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editForm.flat_path}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, flat_path: e.target.value }))
                      }
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Select target folder..."
                      data-testid="flat-path-input"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePickFolder('flat_path')}
                    >
                      <FolderOpen className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Staleness Policy */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground">Staleness Policy</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Preferred Model Family
                    </label>
                    <input
                      type="text"
                      value={stalenessForm.prefer_model_family ?? ''}
                      onChange={(e) =>
                        setStalenessForm((prev) => ({
                          ...prev,
                          prefer_model_family: e.target.value || undefined,
                        }))
                      }
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="e.g. roformer"
                      data-testid="prefer-model-family-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Quality Rank Threshold
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={stalenessForm.quality_rank_threshold ?? ''}
                      onChange={(e) =>
                        setStalenessForm((prev) => ({
                          ...prev,
                          quality_rank_threshold: e.target.value
                            ? parseInt(e.target.value, 10)
                            : undefined,
                        }))
                      }
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="0"
                      data-testid="quality-rank-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Age Days Threshold</label>
                    <input
                      type="number"
                      min={0}
                      value={stalenessForm.age_days_threshold ?? ''}
                      onChange={(e) =>
                        setStalenessForm((prev) => ({
                          ...prev,
                          age_days_threshold: e.target.value
                            ? parseInt(e.target.value, 10)
                            : undefined,
                        }))
                      }
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="e.g. 90"
                      data-testid="age-days-input"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="flag-unknown"
                      checked={stalenessForm.flag_unknown_provenance}
                      onChange={(e) =>
                        setStalenessForm((prev) => ({
                          ...prev,
                          flag_unknown_provenance: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-input"
                      data-testid="flag-unknown-checkbox"
                    />
                    <label htmlFor="flag-unknown" className="text-xs text-muted-foreground">
                      Flag unknown provenance
                    </label>
                  </div>
                </div>
              </div>

              {/* Ignore Patterns */}
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Ignore Patterns</h4>
                <textarea
                  value={globsText}
                  onChange={(e) => setGlobsText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={"*.tmp\n*.bak\n._*"}
                  data-testid="ignore-patterns-textarea"
                />
                <p className="text-xs text-muted-foreground">
                  One glob pattern per line. Matching files will be excluded from scans.
                </p>
              </div>

              {/* Save / Cancel */}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} data-testid="save-btn">
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
