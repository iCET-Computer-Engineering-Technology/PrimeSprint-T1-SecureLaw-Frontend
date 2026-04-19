import { PiiDetectApiService } from './pii-detect-api-service';
import { ExtractTextApiService } from './extract-text-api-service';
import { inject, Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  retry,
  switchMap,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { MaskApiService } from './mask-api-service';
import { ExternalAiApiService } from './external-ai-api-service';
import { RehydrateApiService } from './rehydrate-api-service';
import {
  ExternalAiResponse,
  PiiDetectResponse,
  RehydrateResponse,
} from '../models/secure-flow.model';
import { environment } from '../../environments/environment';
import { HttpErrorResponse } from '@angular/common/http';

export type SecureFlowPipelineStage =
  | 'IDLE'
  | 'UPLOADING'
  | 'EXTRACTING'
  | 'DETECTING'
  | 'MASKING'
  | 'EXTERNAL_AI'
  | 'REHYDRATING'
  | 'DONE'
  | 'ERROR';

export interface SecureFlowPipelineState {
  stage: SecureFlowPipelineStage;
  loading: boolean;
  error: unknown;

  pipelineId?: string;

  uploadId?: string;
  extractedText?: string | null;
  sensitiveData?: PiiDetectResponse;
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

  private requireState<T>(value: T, message: string): NonNullable<T> {
    if (value === null || value === undefined) {
      throw new Error(message);
    }

    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(message);
    }

    return value as NonNullable<T>;
  }

  private createRequestId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return Math.random().toString(36).slice(2);
    }
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
      mappingId: undefined,
      tokenMappings: undefined,
      tokenizedResponse: undefined,
      result: undefined,
      externalAiProvider: undefined,
      externalAiModel: undefined,
    });

    const extracted$: Observable<{ uploadId?: string; extractedText: string | null }> = file
      ? this.extractTextApi.extract({ file }).pipe(
          tap((uploadRes) => {
            this.logInfo(`extractText (${pipelineId})`, uploadRes);
            this.patchStateFor(pipelineId, {
              stage: 'EXTRACTING',
              loading: true,
              uploadId: uploadRes.uploadId,
              extractedText: uploadRes.extractedText,
            });
          }),
          map((uploadRes) => ({
            uploadId: uploadRes.uploadId,
            extractedText: uploadRes.extractedText,
          })),
        )
      : of({ extractedText: extractedTextFallback });

    return extracted$.pipe(
      switchMap(({ extractedText }) => {
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
      }),

      switchMap(({ detectRes, extractedText }) => {
        if (extractedText === null && detectRes.length === 0) {
          this.logDebug(`CHAT_FLOW_BYPASS (${pipelineId})`);
          this.patchStateFor(pipelineId, {
            stage: 'EXTERNAL_AI',
            loading: true,
            sensitiveData: detectRes,
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
        this.logDebug(`SECURE_FLOW (${pipelineId})`);
        this.patchStateFor(pipelineId, {
          stage: 'MASKING',
          loading: true,
          sensitiveData: detectRes,
        });
        return this.maskApi
          .mask({
            requestId: pipelineId,
            prompt: cleanedPrompt,
            document: extractedText ?? '',
            sensitiveData: detectRes,
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
            switchMap((maskRes) =>
              this.runExternalAiWithRetry({
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
                switchMap((extRes) => {
                  const mappingId = this.requireState(
                    this.state.value.mappingId,
                    'Pipeline state missing mappingId',
                  );
                  return this.rehydrateApi.rehydrate({
                    mappingId,
                    tokenizedResponse: extRes.tokenizedResponse,
                    tokenMappings: this.state.value.tokenMappings,
                  });
                }),
              ),
            ),
          );
      }),
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
