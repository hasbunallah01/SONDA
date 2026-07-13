/**
 * app/review/zip/page.tsx — Local Project ZIP review form (frontend only).
 *
 * Sibling of /review/website and /review/github: same layout, same
 * submit-no-op behaviour, same accessibility wiring. The intake is a
 * local ZIP file the user picks via drag-and-drop or a file picker.
 * The file is read client-side only to surface its name and size in
 * the UI — no extraction, no upload, no backend call.
 *
 * Design
 *  - Mirrors the other two review pages: back link → eyebrow / title /
 *    description → form card → info card.
 *  - Drag-and-drop zone is a large dashed-border region that highlights
 *    on dragover; the hidden <input type="file"> is opened via a
 *    "Choose file" button so the UI works for both mouse and keyboard
 *    users.
 *  - Reuses the same Card and Button primitives, the primary-soft
 *    icon tile, and the same max-width container.
 *
 * Accessibility
 *  - Wrapped in a semantic <main>.
 *  - The drop zone is a real <button>-style target via a clickable
 *    wrapper; the actual <input type="file"> is the source of truth and
 *    is wired to a visible label and helper text.
 *  - On submit we call event.preventDefault() to keep this static.
 *  - A live region announces the local "investigation queued" message
 *    so screen readers hear the change.
 *
 * Out of scope (per task)
 *  - No file processing, no ZIP extraction, no backend, no API.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  FolderTree,
  Layers,
  Rocket,
  ScrollText,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AnalysisItem {
  /** Short title shown in bold. */
  title: string;
  /** One-line description of what SONDA looks for. */
  description: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
}

const ANALYSIS_ITEMS: AnalysisItem[] = [
  {
    title: 'Folder structure',
    description: 'Top-level layout and how discoverable the project is at a glance.',
    icon: FolderTree,
  },
  {
    title: 'Documentation',
    description: 'READMEs, guides, and the path from download to running.',
    icon: ScrollText,
  },
  {
    title: 'Frontend organization',
    description: 'Component boundaries, naming, and how the UI layer is composed.',
    icon: Layers,
  },
  {
    title: 'Backend organization',
    description: 'Routes, services, and how the server side is split up.',
    icon: Boxes,
  },
  {
    title: 'Project completeness',
    description: 'Whether what is shipped actually matches what is promised.',
    icon: FileArchive,
  },
  {
    title: 'Startup readiness',
    description: 'A single Ship / Refine / Hold decision backed by the evidence above.',
    icon: Rocket,
  },
];

/** Max ZIP size surfaced in the UI. Real enforcement is out of scope here. */
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_SIZE_LABEL = '50 MB';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const validateFile = (file: File): string | null => {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.zip')) {
    return 'Please choose a .zip file.';
  }
  if (file.size === 0) {
    return 'This file is empty. Pick a project ZIP with content inside.';
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `File is larger than ${MAX_SIZE_LABEL}. Compress or split before uploading.`;
  }
  return null;
};

const ZipReviewPage: React.FC = () => {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [submittedFile, setSubmittedFile] = React.useState<File | null>(null);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Stable ids for aria wiring.
  const dropzoneId = React.useId();
  const helperId = `${dropzoneId}-helper`;
  const errorId = `${dropzoneId}-error`;
  const titleId = React.useId();

  const acceptFile = React.useCallback((candidate: File | null | undefined): void => {
    if (!candidate) return;
    const validationError = validateFile(candidate);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setError(null);
    setFile(candidate);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.files?.[0] ?? null;
    acceptFile(next);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const next = event.dataTransfer.files?.[0] ?? null;
    acceptFile(next);
  };

  const openFilePicker = (): void => {
    inputRef.current?.click();
  };

  const clearFile = (): void => {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!file) return;
    // Frontend only — acknowledge locally; the real flow is wired up in
    // a later task.
    setSubmittedFile(file);
  };

  const canSubmit = file !== null;

  return (
    <main className="relative w-full bg-background px-6 py-20 text-text-primary sm:py-24">
      <div className="mx-auto w-full max-w-3xl">
        {/* Back link */}
        <div className="mb-8">
          <Button aria-label="Back to review setup" asChild={true} size="sm" variant="ghost">
            <Link href="/review">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back to review setup</span>
            </Link>
          </Button>
        </div>

        {/* Page header — same pattern as the other review pages. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            Local project
          </p>
          <h1
            className="mt-3 font-display text-h1 font-semibold leading-tight tracking-tight sm:text-display"
            id={titleId}
          >
            Review a Local Project
          </h1>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            Upload your project files and let SONDA inspect your product structure.
          </p>
        </div>

        {/* Form card */}
        <Card className="mt-12">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
              >
                <FileArchive className="h-5 w-5" strokeWidth={2} />
              </span>
              <span
                aria-hidden="true"
                className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
              >
                Step 1 · Upload ZIP
              </span>
            </div>
            <CardTitle as="h2" className="mt-4 text-h4">
              Project ZIP
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              Drop a packaged snapshot of your project below, or pick one from your machine. SONDA
              will treat it as the only source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              aria-labelledby={titleId}
              className="flex flex-col gap-4"
              onSubmit={handleSubmit}
            >
              {/* Hidden file input — the actual input the browser writes to. */}
              <input
                ref={inputRef}
                accept=".zip,application/zip,application/x-zip-compressed"
                aria-describedby={error ? errorId : helperId}
                aria-invalid={error ? true : undefined}
                className="sr-only"
                id={dropzoneId}
                type="file"
                onChange={handleInputChange}
              />

              {/* Drop zone */}
              <div
                aria-label="Drag and drop a ZIP file, or use the choose file button"
                className={[
                  'flex flex-col items-center justify-center gap-3',
                  'rounded-lg border-2 border-dashed',
                  'px-6 py-10 text-center',
                  'transition-colors duration-200 ease-out',
                  isDragging
                    ? 'border-primary bg-primary-soft/40'
                    : 'border-border bg-background/40 hover:border-primary/50',
                ].join(' ')}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft text-primary"
                >
                  <CloudUpload className="h-6 w-6" strokeWidth={2} />
                </span>
                <div className="flex flex-col items-center gap-1">
                  <p className="font-display text-body font-semibold text-text-primary">
                    Drag and drop your project ZIP
                  </p>
                  <p className="text-caption text-text-secondary">
                    or use the button below — {MAX_SIZE_LABEL} max
                  </p>
                </div>
                <Button
                  aria-label="Choose a ZIP file from your computer"
                  size="md"
                  type="button"
                  variant="outline"
                  onClick={openFilePicker}
                >
                  Choose file
                </Button>
              </div>

              {/* Selected file chip */}
              {file && !error ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-surface-elevated p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                    >
                      <FileArchive className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span
                        aria-label={`Selected file ${file.name}, size ${formatBytes(file.size)}`}
                        className="truncate font-mono text-caption text-text-primary"
                      >
                        {file.name}
                      </span>
                      <span className="text-caption text-text-muted">{formatBytes(file.size)}</span>
                    </div>
                  </div>
                  <Button
                    aria-label="Remove selected file"
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={clearFile}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              {/* Error message */}
              {error ? (
                <p className="text-caption font-medium text-error" id={errorId} role="alert">
                  {error}
                </p>
              ) : (
                <p className="text-caption text-text-muted" id={helperId}>
                  Only <span className="font-mono">.zip</span> files up to {MAX_SIZE_LABEL}. Your
                  file is not uploaded anywhere — this page is a placeholder for the intake step.
                </p>
              )}

              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-text-muted">
                  You can swap the file before SONDA starts.
                </p>
                <Button
                  aria-label="Start SONDA investigation"
                  className="w-full sm:w-auto"
                  disabled={!canSubmit}
                  size="lg"
                  type="submit"
                  variant="primary"
                >
                  Start Investigation
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Local acknowledgement — silent until the user submits. */}
        {submittedFile ? (
          <div
            aria-live="polite"
            className="mt-6 flex items-start gap-3 rounded-md border border-primary/30 bg-primary-soft/60 p-4 text-caption text-text-primary"
            role="status"
          >
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              <span className="font-semibold">Investigation queued.</span> SONDA will inspect{' '}
              <span className="break-all font-mono">{submittedFile.name}</span> (
              {formatBytes(submittedFile.size)}) and report back with a launch verdict.
            </p>
          </div>
        ) : null}

        {/* Info card — what SONDA will analyze. */}
        <Card className="mt-8" noHover={true}>
          <CardHeader>
            <CardTitle as="h2" className="text-h5">
              What SONDA will analyze
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              The jury scores your project against six focused dimensions before returning a single
              launch verdict.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label="Analysis dimensions" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ANALYSIS_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.title}
                    className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-display text-caption font-semibold text-text-primary">
                        {item.title}
                      </span>
                      <span className="mt-0.5 text-caption leading-snug text-text-secondary">
                        {item.description}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ZipReviewPage;
