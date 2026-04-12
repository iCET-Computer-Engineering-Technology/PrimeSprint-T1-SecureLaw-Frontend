import { PiiDetectApiService } from './pii-detect-api-service';
import { ExtractTextApiService } from './extract-text-api-service';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Subject,
  Observable,
  catchError,
  concatMap,
  filter,
  finalize,
  from,
  map,
  of,
  retry,
  switchMap,
  tap,
  take,
  throwError,
  timer,
  toArray,
} from 'rxjs';
import { MaskApiService } from './mask-api-service';
import { ExternalAiApiService } from './external-ai-api-service';
import { RehydrateApiService } from './rehydrate-api-service';
import {
  ExternalAiResponse,
  MaskResponse,
  PiiDetectResponse,
  RehydrateResponse,
  SensitiveDataItem,
} from '../models/secure-flow.model';
import { environment } from '../../environments/environment';
import { HttpErrorResponse } from '@angular/common/http';

export type SecureFlowPipelineStage =
  | 'IDLE'
  | 'UPLOADING'
  | 'EXTRACTING'
  | 'DETECTING'
  | 'CONFIRMING'
  | 'MASKING'
  | 'EXTERNAL_AI'
  | 'REHYDRATING'
  | 'DONE'
  | 'ERROR';

export interface PiiSpanConflict {
  key: string;
  source: string;
  start: number;
  end: number;
  value: string;
  types: string[];
}

export interface SecureFlowPipelineState {
  stage: SecureFlowPipelineStage;
  loading: boolean;
  error: unknown;

  pipelineId?: string;

  uploadId?: string;
  extractedText?: string | null;
  sensitiveData?: PiiDetectResponse;
  duplicateSensitiveData?: PiiDetectResponse;
  piiConflict?: PiiSpanConflict | null;
  piiConflictsRemaining?: number;
  mappingId?: string;
  tokenMappings?: Record<string, string>;
  tokenizedResponse?: string;
  result?: string;

  externalAiProvider?: string;
  externalAiModel?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SecureFlowPipelineService {
  private readonly extractTextApi = inject(ExtractTextApiService);
  private readonly piiDetectApi = inject(PiiDetectApiService);
  private readonly maskApi = inject(MaskApiService);
  private readonly externalAiApi = inject(ExternalAiApiService);
  private readonly rehydrateApi = inject(RehydrateApiService);

  private readonly state = new BehaviorSubject<SecureFlowPipelineState>({
    stage: 'IDLE',
    loading: false,
    error: null,
  });

  readonly state$: Observable<SecureFlowPipelineState> = this.state.asObservable();
  private activePipelineId: string | null = null;

  private readonly piiConflictChoice$ = new Subject<{
    pipelineId: string;
    conflictKey: string;
    selectedType: string;
  }>();

  private readonly logPrefix = '[SecureFlowPipeline]';

  private isDebugEnabled(): boolean {
    return !environment.production && environment.debugSecureFlow;
  }

  private logDebug(message: string, payload?: unknown): void {
    if (!this.isDebugEnabled()) {
      return;
    }

    if (payload === undefined) {
      console.debug(this.logPrefix, message);
      return;
    }

    console.debug(this.logPrefix, message, payload);
  }

  private logInfo(message: string, payload?: unknown): void {
    if (!this.isDebugEnabled()) {
      return;
    }

    if (payload === undefined) {
      console.info(this.logPrefix, message);
      return;
    }

    console.info(this.logPrefix, message, payload);
  }

  private patchState(patch: Partial<SecureFlowPipelineState>): void {
    const prev = this.state.value;
    const next = { ...prev, ...patch };
    this.state.next(next);

    if (!this.isDebugEnabled()) {
      return;
    }

    const stageChanged = prev.stage !== next.stage;
    const loadingChanged = prev.loading !== next.loading;
    const errorChanged = prev.error !== next.error;
    if (stageChanged || loadingChanged || errorChanged) {
      this.logDebug('state updated', {
        stage: `${prev.stage} -> ${next.stage}`,
        loading: `${prev.loading} -> ${next.loading}`,
        error: next.error,
      });
    } else {
      this.logDebug('state patched', patch);
    }
  }

  private patchStateFor(pipelineId: string, patch: Partial<SecureFlowPipelineState>): void {
    if (this.activePipelineId !== pipelineId) {
      return;
    }

    this.patchState(patch);
  }

  private createRequestId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }

  confirmPiiSpanType(pipelineId: string, conflictKey: string, selectedType: string): void {
    if (this.activePipelineId !== pipelineId) {
      return;
    }

    const type = (selectedType ?? '').trim();
    if (!type) {
      return;
    }

    this.piiConflictChoice$.next({ pipelineId, conflictKey, selectedType: type });
  }

  private piiSpanKeyOf(item: Pick<SensitiveDataItem, 'source' | 'start' | 'end'>): string {
    const source = (item.source ?? '').trim().toLowerCase();
    return `${source}:${item.start}:${item.end}`;
  }

  private buildPiiSpanConflict(key: string, items: SensitiveDataItem[]): PiiSpanConflict {
    const first = items[0];
    const types = Array.from(
      new Set(items.map((i) => (i.type ?? '').trim()).filter((t) => t.length > 0)),
    ).sort((a, b) => a.localeCompare(b));

    return {
      key,
      source: first?.source ?? '',
      start: Number(first?.start ?? 0),
      end: Number(first?.end ?? 0),
      value: typeof first?.value === 'string' ? first.value : '',
      types,
    };
  }

  private resolvePiiDetectResponseWithUserConfirmation(
    pipelineId: string,
    detectRes: PiiDetectResponse,
  ): Observable<PiiDetectResponse> {
    this.patchStateFor(pipelineId, { piiConflict: null, piiConflictsRemaining: undefined });

    const itemsBySpanKey = new Map<string, SensitiveDataItem[]>();
    const spanKeyOrder: string[] = [];

    for (const item of detectRes ?? []) {
      const key = this.piiSpanKeyOf(item);
      const existing = itemsBySpanKey.get(key);
      if (existing) {
        existing.push(item);
      } else {
        itemsBySpanKey.set(key, [item]);
        spanKeyOrder.push(key);
      }
    }

    const duplicateItems: PiiDetectResponse = [];
    for (const key of spanKeyOrder) {
      const items = itemsBySpanKey.get(key) ?? [];
      if (items.length > 1) {
        duplicateItems.push(...items);
      }
    }
    this.patchStateFor(pipelineId, {
      duplicateSensitiveData: duplicateItems.length > 0 ? duplicateItems : undefined,
    });

    type ConflictGroup = { key: string; items: SensitiveDataItem[]; conflict: PiiSpanConflict };
    const resolvedWithoutConfirmation: SensitiveDataItem[] = [];
    const conflicts: ConflictGroup[] = [];

    for (const key of spanKeyOrder) {
      const items = itemsBySpanKey.get(key);
      if (!items?.length) {
        continue;
      }

      const types = new Set(items.map((i) => (i.type ?? '').trim()).filter((t) => t.length > 0));

      // If we got multiple results but they all agree on the type, we can safely de-dupe.
      if (types.size <= 1) {
        resolvedWithoutConfirmation.push(items[0]);
        continue;
      }

      const conflict = this.buildPiiSpanConflict(key, items);
      conflicts.push({ key, items, conflict });
    }

    if (conflicts.length === 0) {
      return of(this.sortPiiBySpan(resolvedWithoutConfirmation));
    }

    return from(conflicts).pipe(
      concatMap((group, idx) => {
        const conflictsRemaining = conflicts.length - idx;
        this.patchStateFor(pipelineId, {
          stage: 'CONFIRMING',
          loading: true,
          error: null,
          piiConflict: group.conflict,
          piiConflictsRemaining: conflictsRemaining,
        });

        return this.piiConflictChoice$.pipe(
          filter(
            (c) =>
              c.pipelineId === pipelineId &&
              c.conflictKey === group.key &&
              group.conflict.types.includes(c.selectedType),
          ),
          take(1),
          map((c) => {
            const match = group.items.find((i) => (i.type ?? '').trim() === c.selectedType);
            const base = match ?? group.items[0];
            return { ...base, type: c.selectedType } satisfies SensitiveDataItem;
          }),
          tap(() => {
            this.patchStateFor(pipelineId, { piiConflict: null });
          }),
        );
      }),
      toArray(),
      map((chosen) => this.sortPiiBySpan([...resolvedWithoutConfirmation, ...chosen])),
      finalize(() => {
        this.patchStateFor(pipelineId, {
          piiConflict: null,
          piiConflictsRemaining: undefined,
        });
      }),
    );
  }

  private sortPiiBySpan(items: SensitiveDataItem[]): PiiDetectResponse {
    const next = [...(items ?? [])];
    next.sort((a, b) => {
      const sa = (a.source ?? '').toLowerCase();
      const sb = (b.source ?? '').toLowerCase();
      const sourceDiff = sa.localeCompare(sb);
      if (sourceDiff !== 0) {
        return sourceDiff;
      }

      const startDiff = a.start - b.start;
      if (startDiff !== 0) {
        return startDiff;
      }

      const endDiff = a.end - b.end;
      if (endDiff !== 0) {
        return endDiff;
      }

      return (a.type ?? '').localeCompare(b.type ?? '');
    });
    return next;
  }

  private isRetryableExternalAiError(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse)) {
      return false;
    }
    if (err.status === 0 || err.status === 429) {
      return true;
    }

    if (err.status >= 500 && err.status <= 504) {
      return true;
    }

    return false;
  }

  private runExternalAiWithRetry(args: {
    pipelineId: string;
    maskedPrompt: string;
    maskedDocument: string;
    tokenMappings: Record<string, string>;
  }): Observable<ExternalAiResponse> {
    const { pipelineId, maskedPrompt, maskedDocument, tokenMappings } = args;

    return this.externalAiApi
      .process({
        requestId: pipelineId,
        provider: 'gemini',
        maskedPrompt,
        maskedDocument,
        tokenMappings,
        options: {
          model: 'default',
          maxTokens: 0,
          temperature: 0.1,
        },
        timeoutMs: 0,
      })
      .pipe(
        retry({
          count: 2,
          delay: (err, retryCount) => {
            if (!this.isRetryableExternalAiError(err)) {
              throw err;
            }
            const delayMs = Math.min(4000, 500 * Math.pow(2, retryCount));
            this.logDebug(`externalAi retry #${retryCount} in ${delayMs}ms`, err);
            return timer(delayMs);
          },
        }),
      );
  }

  private isTransientServerStatus(status: number): boolean {
    return status >= 500 && status <= 504;
  }

  private httpErrorToUserMessage(err: HttpErrorResponse): string {
    switch (err.status) {
      case 0:
        return 'Unable to reach the server. Please check your connection and try again.';
      case 413:
        return 'The uploaded file is too large. Please try a smaller file.';
      case 415:
        return 'Unsupported file type. Please upload a supported document format.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return this.isTransientServerStatus(err.status)
          ? 'Server error. Please try again in a moment.'
          : 'Request failed. Please try again.';
    }
  }

  private unknownToMessage(err: unknown): string | null {
    if (typeof err === 'string') {
      const trimmed = err.trim();
      return trimmed || null;
    }

    if (typeof err === 'object' && err !== null && 'message' in err) {
      const maybeMessage = (err as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        const trimmed = maybeMessage.trim();
        return trimmed || null;
      }
    }

    return null;
  }

  private toUserFriendlyError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      return new Error(this.httpErrorToUserMessage(err));
    }

    if (err instanceof Error) {
      return err;
    }

    const msg = this.unknownToMessage(err);
    return new Error(msg ?? 'Something went wrong. Please try again.');
  }

  private runChatFlowBypass(
    pipelineId: string,
    cleanedPrompt: string,
    sensitiveData: PiiDetectResponse,
  ): Observable<RehydrateResponse> {
    this.logDebug(`CHAT_FLOW_BYPASS (${pipelineId})`);
    this.patchStateFor(pipelineId, {
      stage: 'EXTERNAL_AI',
      loading: true,
      sensitiveData,
    });

    return this.runExternalAiWithRetry({
      pipelineId,
      maskedPrompt: cleanedPrompt,
      maskedDocument: '',
      tokenMappings: {},
    }).pipe(
      tap((extRes) => {
        this.logInfo(`externalAi (${pipelineId})`, extRes);
        this.patchStateFor(pipelineId, {
          stage: 'DONE',
          loading: false,
          result: extRes.tokenizedResponse,
          externalAiProvider: extRes.provider,
          externalAiModel: extRes.model,
        });
      }),
      map((extRes) => ({ finalText: extRes.tokenizedResponse }) as RehydrateResponse),
    );
  }

  private runExternalAiThenRehydrate(
    pipelineId: string,
    maskRes: MaskResponse,
  ): Observable<RehydrateResponse> {
    return this.runExternalAiWithRetry({
      pipelineId,
      maskedPrompt: maskRes.maskedPrompt,
      maskedDocument: maskRes.maskedDocument,
      tokenMappings: maskRes.tokenMappings,
    }).pipe(
      tap((extRes) => {
        this.logInfo(`externalAi (${pipelineId})`, extRes);
        this.patchStateFor(pipelineId, {
          stage: 'REHYDRATING',
          loading: true,
          tokenizedResponse: extRes.tokenizedResponse,
          externalAiProvider: extRes.provider,
          externalAiModel: extRes.model,
        });
      }),
      switchMap((extRes) =>
        this.rehydrateApi.rehydrate({
          mappingId: maskRes.mappingId,
          tokenizedResponse: extRes.tokenizedResponse,
          tokenMappings: maskRes.tokenMappings,
        }),
      ),
    );
  }

  private runSecureFlow(
    pipelineId: string,
    cleanedPrompt: string,
    extractedText: string | null,
    sensitiveData: PiiDetectResponse,
  ): Observable<RehydrateResponse> {
    this.logDebug(`SECURE_FLOW (${pipelineId})`);
    this.patchStateFor(pipelineId, {
      stage: 'MASKING',
      loading: true,
      sensitiveData,
    });

    return this.maskApi
      .mask({
        requestId: pipelineId,
        prompt: cleanedPrompt,
        document: extractedText ?? '',
        sensitiveData,
      })
      .pipe(
        tap((maskRes) => {
          this.logInfo(`mask (${pipelineId})`, maskRes);
          this.patchStateFor(pipelineId, {
            stage: 'EXTERNAL_AI',
            loading: true,
            mappingId: maskRes.mappingId,
            tokenMappings: maskRes.tokenMappings,
          });
        }),
        switchMap((maskRes) => this.runExternalAiThenRehydrate(pipelineId, maskRes)),
      );
  }

  private extractTextStep(
    pipelineId: string,
    file: File | null | undefined,
    extractedTextFallback: string | null,
  ): Observable<{ uploadId?: string; extractedText: string | null }> {
    if (!file) {
      return of({ extractedText: extractedTextFallback });
    }

    this.patchStateFor(pipelineId, {
      stage: 'EXTRACTING',
      loading: true,
      error: null,
    });

    return this.extractTextApi.extract({ file }).pipe(
      tap((uploadRes) => {
        this.logInfo(`extractText (${pipelineId})`, uploadRes);
        this.patchStateFor(pipelineId, {
          uploadId: uploadRes.uploadId,
          extractedText: uploadRes.extractedText,
        });
      }),
      map((uploadRes) => ({
        uploadId: uploadRes.uploadId,
        extractedText: uploadRes.extractedText,
      })),
    );
  }

  private detectSensitiveDataStep(
    pipelineId: string,
    cleanedPrompt: string,
    extractedText: string | null,
  ): Observable<{ detectRes: PiiDetectResponse; extractedText: string | null }> {
    this.patchStateFor(pipelineId, { stage: 'DETECTING', loading: true, extractedText });

    return this.piiDetectApi
      .detect({
        requestId: pipelineId,
        documentExtractedContent: extractedText,
        userPrompt: cleanedPrompt,
      })
      .pipe(
        tap((detectRes) => {
          this.logInfo(`piiDetect (${pipelineId})`, detectRes);
        }),
        map((detectRes) => ({ detectRes, extractedText })),
      );
  }

  private runAfterDetectStep(
    pipelineId: string,
    cleanedPrompt: string,
    extractedText: string | null,
    detectRes: PiiDetectResponse,
  ): Observable<RehydrateResponse> {
    return this.resolvePiiDetectResponseWithUserConfirmation(pipelineId, detectRes).pipe(
      switchMap((resolvedDetectRes) =>
        extractedText === null && resolvedDetectRes.length === 0
          ? this.runChatFlowBypass(pipelineId, cleanedPrompt, resolvedDetectRes)
          : this.runSecureFlow(pipelineId, cleanedPrompt, extractedText, resolvedDetectRes),
      ),
    );
  }

  startPipeline(prompt: string, file?: File | null): Observable<RehydrateResponse> {
    if (this.state.value.loading) {
      return throwError(() => new Error('A request is already in progress. Please wait.'));
    }

    const cleanedPrompt = prompt?.trim();
    if (!cleanedPrompt) {
      this.patchState({ stage: 'ERROR', loading: false, error: new Error('Prompt is required') });
      return throwError(() => new Error('Prompt is required'));
    }

    const pipelineId = this.createRequestId();
    this.activePipelineId = pipelineId;

    this.logInfo(`startPipeline (${pipelineId})`, {
      prompt: cleanedPrompt,
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
    });

    const extractedTextFallback = null;

    this.patchStateFor(pipelineId, {
      stage: file ? 'UPLOADING' : 'DETECTING',
      loading: true,
      error: null,
      pipelineId,
      uploadId: undefined,
      extractedText: file ? undefined : extractedTextFallback,
      sensitiveData: undefined,
      duplicateSensitiveData: undefined,
      piiConflict: null,
      piiConflictsRemaining: undefined,
      mappingId: undefined,
      tokenMappings: undefined,
      tokenizedResponse: undefined,
      result: undefined,
      externalAiProvider: undefined,
      externalAiModel: undefined,
    });

    return this.extractTextStep(pipelineId, file, extractedTextFallback).pipe(
      switchMap(({ extractedText }) =>
        this.detectSensitiveDataStep(pipelineId, cleanedPrompt, extractedText),
      ),
      switchMap(({ detectRes, extractedText }) =>
        this.runAfterDetectStep(pipelineId, cleanedPrompt, extractedText, detectRes),
      ),
      tap((finalRes) => {
        if (this.state.value.stage !== 'DONE') {
          this.logInfo(`rehydrate (${pipelineId})`, finalRes);
          this.patchStateFor(pipelineId, {
            stage: 'DONE',
            loading: false,
            result: finalRes.finalText,
          });
        }
      }),
      catchError((err) => {
        this.logDebug(`pipeline error (${pipelineId})`, err);
        const friendly = this.toUserFriendlyError(err);
        this.patchStateFor(pipelineId, { stage: 'ERROR', loading: false, error: friendly });
        return throwError(() => friendly);
      }),
      finalize(() => {
        if (this.activePipelineId === pipelineId) {
          this.activePipelineId = null;
        }
      }),
    );
  }
}
