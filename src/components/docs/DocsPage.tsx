import { useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { BookOpen, Download, FileText, Lightbulb, PlusCircle, ShieldCheck, Trash2 } from 'lucide-react';
import type { WorkspaceDoc } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DocsPageProps {
  workspaceName: string;
  docs: WorkspaceDoc[];
  loading: boolean;
  canUpload: boolean;
  onUpload: (payload: {
    title: string;
    category: 'sop' | 'policy' | 'guideline' | 'other';
    notes?: string;
    fileName?: string;
    fileType?: string;
    fileDataUrl?: string;
  }) => Promise<void>;
  onDeleteDoc?: (docId: string) => Promise<void>;
}

export function DocsPage({ workspaceName, docs, loading, canUpload, onUpload, onDeleteDoc }: DocsPageProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'sop' | 'policy' | 'guideline' | 'other'>('sop');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const groupedCount = useMemo(() => {
    return docs.reduce(
      (acc, item) => {
        acc[item.category] += 1;
        return acc;
      },
      { sop: 0, policy: 0, guideline: 0, other: 0 }
    );
  }, [docs]);

  const safeRelativeTime = (iso: string | null | undefined) => {
    if (!iso) return 'recently';
    const date = parseISO(iso);
    if (Number.isNaN(date.getTime())) return 'recently';
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const resetForm = () => {
    setTitle('');
    setCategory('sop');
    setNotes('');
    setSelectedFile(null);
  };

  const handlePickFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      window.alert('File too large. Max 2 MB.');
      return;
    }
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setSelectedFile({ name: file.name, type: file.type || 'application/octet-stream', dataUrl });
  };

  const handleUpload = async () => {
    if (!title.trim()) return;
    setUploading(true);
    try {
      await onUpload({
        title: title.trim(),
        category,
        notes: notes.trim() || undefined,
        fileName: selectedFile?.name,
        fileType: selectedFile?.type,
        fileDataUrl: selectedFile?.dataUrl,
      });
      resetForm();
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-primary/[0.04] p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <BookOpen className="h-3.5 w-3.5" />
              Docs
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-tight">Workspace Documentation</CardTitle>
                <CardDescription className="mt-1">Guides, SOPs aur onboarding docs for {workspaceName}.</CardDescription>
              </div>
              <div className="rounded-xl border border-border/70 bg-background px-3 py-2 text-right shadow-sm">
                <p className="text-[11px] text-muted-foreground">Total docs</p>
                <p className="text-lg font-semibold text-foreground">{docs.length}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Category Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p className="rounded-lg border border-border/70 bg-background px-2.5 py-2">SOPs: {groupedCount.sop}</p>
              <p className="rounded-lg border border-border/70 bg-background px-2.5 py-2">Policies: {groupedCount.policy}</p>
              <p className="rounded-lg border border-border/70 bg-background px-2.5 py-2">Guidelines: {groupedCount.guideline}</p>
              <p className="rounded-lg border border-border/70 bg-background px-2.5 py-2">Other docs: {groupedCount.other}</p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlusCircle className="h-4 w-4 text-primary" />
                Upload Document (Admin)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm text-muted-foreground">
              {!canUpload ? (
                <p className="rounded-lg border border-border/70 bg-background px-3 py-2.5 text-xs">
                  Only admin can upload SOP/company policy documents.
                </p>
              ) : (
                <>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Document title (e.g. Leave Policy)"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as 'sop' | 'policy' | 'guideline' | 'other')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="sop">SOP</option>
                    <option value="policy">Policy</option>
                    <option value="guideline">Guideline</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Notes (optional)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <input type="file" onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)} className="text-xs" />
                  {selectedFile && <p className="text-[11px] text-muted-foreground">Selected: {selectedFile.name}</p>}
                  <button
                    type="button"
                    disabled={uploading || !title.trim()}
                    onClick={() => handleUpload().catch((error) => window.alert(error?.message || 'Upload failed'))}
                    className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {uploading ? 'Uploading...' : 'Upload Doc'}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Uploaded Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loading ? (
              <p className="rounded-lg border border-border/70 bg-background p-4 text-center">Loading docs...</p>
            ) : docs.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-border/70 bg-background p-3">
                <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" />
                No documents uploaded yet. Admin can upload SOP/policy files from the form above.
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li key={doc.id} className="rounded-lg border border-border/70 bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{doc.title}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{doc.category}</p>
                        {doc.notes && <p className="mt-1 text-xs text-muted-foreground">{doc.notes}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Uploaded {safeRelativeTime(doc.created_at)}
                        </p>
                      </div>
                      {doc.file_data_url && (
                        <a
                          href={doc.file_data_url}
                          download={doc.file_name || `${doc.title}.txt`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted/40"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {doc.file_name || 'Download'}
                        </a>
                      )}
                      {canUpload && onDeleteDoc && (
                        <button
                          type="button"
                          disabled={deletingDocId === doc.id}
                          onClick={async () => {
                            const ok = window.confirm(`Delete "${doc.title}"?`);
                            if (!ok) return;
                            setDeletingDocId(doc.id);
                            try {
                              await onDeleteDoc(doc.id);
                            } finally {
                              setDeletingDocId(null);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingDocId === doc.id ? 'Deleting...' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
