import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  SecureFlowPipelineService,
  SecureFlowPipelineState,
  SecureFlowPipelineStage,
} from '../../services/secure-flow-pipeline-service';
import { environment } from '../../../environments/environment';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { SensitiveDataItem } from '../../models/secure-flow.model';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Theme } from '../../core/services/theme';
import { Token } from '../../core/services/token';
import { Auth } from '../../core/services/auth';

type NormalizedRole = 'SENIOR' | 'JUNIOR' | '';

interface SessionResponse {
  conversationId: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  html?: SafeHtml;
  time: string;
  model?: string;
  warnings?: Array<{ type: string; token: string; message: string }>;

  typing?: boolean;
  displayText?: string;

  segments?: ChatTextSegment[];

  promptPiiSummary?: string;
}

interface ChatTextSegment {
  text: string;
  piiLabel?: string;
}

interface ConversationSummary {
  conversationId: string;
  title: string;
  preview: string;
  messages: ChatMessage[];
  time: string;
}

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChild('chatScroll') chatScrollRef!: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('composer') composerRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('userMenuWrap') userMenuWrapRef?: ElementRef<HTMLElement>;

  conversationId = '';
  userInput = '';
  messages: ChatMessage[] = [];

  isConversationLoading = false;
  isPipelineLoading = false;
  get isLoading(): boolean {
    return this.isConversationLoading || this.isPipelineLoading;
  }

  sidebarHistory: ConversationSummary[] = [];
  activeConversationId = '';
  allConversations = new Map<string, ChatMessage[]>();
  private shouldScroll = false;

  showScrollToBottomButton = false;
  private autoScroll = true;

  private activeTypingIntervalId: number | null = null;
  private activeTypingMessage: ChatMessage | null = null;

  selectedFile: File | null = null;

  userMenuOpen = false;
  currentUserName = 'User';
  currentUserRole: NormalizedRole = '';

  pipelineStage: SecureFlowPipelineStage = 'IDLE';
  pipelineError: unknown = null;
  lastModelUsed: string | null = null;

  private pendingPromptMessage: ChatMessage | null = null;
  private pendingPipelineId: string | null = null;
  private pendingConversationId: string | null = null;

  private readonly apiUrl = environment.apiUrl;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly pipeline = inject(SecureFlowPipelineService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  readonly theme = inject(Theme);
  private readonly token = inject(Token);
  private readonly auth = inject(Auth);

  private renderQueued = false;
  private composerKeyHandlerBound = false;
  private readonly onGlobalKeyDownBound = (event: KeyboardEvent): void =>
    this.onGlobalKeyDown(event);

  private requestRender(immediate = false): void {
    this.cdr.markForCheck();

    const run = () => {
      this.renderQueued = false;
      try {
        this.cdr.detectChanges();
      } catch {}
    };

    if (immediate) {
      run();
      return;
    }

    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;

    try {
      const qm = (globalThis as unknown as { queueMicrotask?: (cb: () => void) => void })
        .queueMicrotask;
      if (typeof qm === 'function') {
        qm(run);
      } else {
        void Promise.resolve().then(run);
      }
    } catch {
      this.renderQueued = false;
      setTimeout(run, 0);
    }
  }

  constructor() {
    marked.setOptions({ gfm: true, breaks: true });
  }

  onThemeCheckboxChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const checked = !!input?.checked;
    this.theme.setMode(checked ? 'dark' : 'light');
  }

  ngAfterViewInit(): void {
    this.bindComposerKeyHandler();
    this.focusComposer(false);
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopTypingAnimation(true));
    this.destroyRef.onDestroy(() => this.unbindComposerKeyHandler());

    this.loadCurrentUser();

    this.pipeline.state$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state: SecureFlowPipelineState) => {
        this.pipelineStage = state.stage;
        this.isPipelineLoading = state.loading;
        this.pipelineError = state.error;

        this.lastModelUsed =
          state.externalAiProvider && state.externalAiModel
            ? `${state.externalAiProvider} / ${state.externalAiModel}`
            : null;

        this.tryAttachPromptHighlights(state);
        this.requestRender(true);
      });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('conversationId');
      if (id) {
        this.stopTypingAnimation(true);
        this.conversationId = id;
        this.activeConversationId = id;
        const saved = this.allConversations.get(id);
        this.messages = saved ? this.ensureRenderedMessages(saved) : [];
        this.clearPendingPromptTracking();
        this.requestRender();
      } else {
        this.startNewConversation();
      }
    });
  }

  private normalizeRole(role: unknown): NormalizedRole {
    const normalized = (role ?? '').toString().trim().toUpperCase();
    if (normalized.startsWith('ROLE_')) {
      return normalized.slice('ROLE_'.length) as NormalizedRole;
    }
    if (normalized === 'SENIOR' || normalized === 'JUNIOR') {
      return normalized;
    }
    return '';
  }

  get role(): NormalizedRole {
    return this.currentUserRole || this.normalizeRole(this.token.getRole());
  }

  get roleLabel(): string {
    switch (this.role) {
      case 'SENIOR':
        return 'Senior Lawyer';
      case 'JUNIOR':
        return 'Junior Lawyer';
      default:
        return 'Lawyer';
    }
  }

  get userInitials(): string {
    const name = (this.currentUserName ?? '').trim();
    if (!name) {
      return 'U';
    }

    const parts = name
      .split(/\s+/g)
      .map((p) => p.trim())
      .filter(Boolean);

    const first = parts[0]?.[0] ?? '';
    const last = (parts.length > 1 ? parts[parts.length - 1] : '')?.[0] ?? '';
    const initials = (first + last).toUpperCase();
    return initials || 'U';
  }

  get canSeeAdminMenu(): boolean {
    return this.role === 'SENIOR';
  }

  private loadCurrentUser(): void {
    // Fast initial values from localStorage.
    this.currentUserRole = this.normalizeRole(this.token.getRole());

    // Prefer server truth when available.
    this.auth
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: unknown) => {
          const me = res as {
            username?: unknown;
            name?: unknown;
            email?: unknown;
            role?: unknown;
          };

          const name =
            (typeof me.name === 'string' && me.name.trim())
              ? me.name
              : (typeof me.username === 'string' && me.username.trim())
                ? me.username
                : (typeof me.email === 'string' && me.email.trim())
                  ? me.email
                  : '';

          if (name) {
            this.currentUserName = name;
          }
          this.currentUserRole = this.normalizeRole(me.role ?? this.currentUserRole);
          this.requestRender();
        },
        error: () => {
          // Non-fatal: keep fallback values.
        },
      });
  }

  toggleUserMenu(event?: Event): void {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.userMenuOpen = !this.userMenuOpen;
    this.requestRender();
  }

  closeUserMenu(): void {
    if (!this.userMenuOpen) {
      return;
    }
    this.userMenuOpen = false;
    this.requestRender();
  }

  get isOnChat(): boolean {
    const url = this.router.url ?? '';
    return url.startsWith('/chat');
  }

  goToChatFromMenu(): void {
    this.closeUserMenu();
    //this.startNewConversation();
  }

  goToUserManagement(): void {
    this.closeUserMenu();
    this.router.navigate(['/admin/user-management']);
  }

  goToAuditLogs(): void {
    this.closeUserMenu();
    this.router.navigate(['/admin/audit-logs']);
  }

  logout(): void {
    this.closeUserMenu();
    this.token.clear();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen) {
      return;
    }

    const wrap = this.userMenuWrapRef?.nativeElement;
    const target = event.target as Node | null;
    if (!wrap || !target) {
      return;
    }

    if (!wrap.contains(target)) {
      this.closeUserMenu();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.userMenuOpen) {
      return;
    }
    event.preventDefault();
    this.closeUserMenu();
  }

  private bindComposerKeyHandler(): void {
    if (this.composerKeyHandlerBound) {
      return;
    }
    this.composerKeyHandlerBound = true;
    globalThis.window.addEventListener('keydown', this.onGlobalKeyDownBound, true);
  }

  private unbindComposerKeyHandler(): void {
    if (!this.composerKeyHandlerBound) {
      return;
    }
    this.composerKeyHandlerBound = false;
    globalThis.window.removeEventListener('keydown', this.onGlobalKeyDownBound, true);
  }

  private isEditableElement(el: Element | null): boolean {
    if (!el) {
      return false;
    }

    const tag = (el as HTMLElement).tagName?.toLowerCase?.() ?? '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return true;
    }

    if ((el as HTMLElement).isContentEditable) {
      return true;
    }

    return false;
  }

  private focusComposer(smoothScroll = true): void {
    const el = this.composerRef?.nativeElement;
    if (!el) {
      return;
    }

    const run = () => {
      try {
        el.focus({ preventScroll: !smoothScroll });
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        try {
          el.focus();
        } catch {}
      }
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
  }

  private onGlobalKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
      return;
    }

    const activeEl = globalThis.document?.activeElement;
    if (this.isEditableElement(activeEl)) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target) {
      const interactive = target.closest(
        'input, textarea, select, button, a, [role="button"], [contenteditable="true"], [contenteditable=""]',
      );
      if (interactive) {
        return;
      }
    }

    if (event.key.length === 1) {
      event.preventDefault();
      this.focusComposer(false);
      this.userInput = (this.userInput ?? '') + event.key;
      this.requestRender(true);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.focusComposer(false);
      this.userInput = (this.userInput ?? '').slice(0, -1);
      this.requestRender(true);
    }
  }

  private stopTypingAnimation(finalizeActiveMessage = false): void {
    if (this.activeTypingIntervalId != null) {
      clearInterval(this.activeTypingIntervalId);
      this.activeTypingIntervalId = null;
    }

    const msg = this.activeTypingMessage;
    this.activeTypingMessage = null;

    if (finalizeActiveMessage && msg && this.messages.includes(msg) && msg.typing) {
      msg.typing = false;
      msg.displayText = undefined;
      msg.html = this.markdownToSafeHtml(msg.content ?? '');
      this.requestRender();
    }
  }

  private startTypingAnimation(message: ChatMessage): void {
    this.stopTypingAnimation(true);
    this.activeTypingMessage = message;

    const fullText = message.content ?? '';
    if (!fullText) {
      message.typing = false;
      message.displayText = undefined;
      message.html = this.markdownToSafeHtml('');
      return;
    }

    message.typing = true;
    message.displayText = '';
    message.html = this.markdownToSafeHtml('');

    const total = fullText.length;
    let index = 0;

    const intervalMs = 30;
    const targetDurationMs = Math.min(3500, Math.max(900, total * 7));
    const ticks = Math.max(1, Math.floor(targetDurationMs / intervalMs));
    const charsPerTick = Math.max(1, Math.ceil(total / ticks));

    index = Math.min(total, charsPerTick);
    message.displayText = fullText.slice(0, index);
    message.html = this.markdownToSafeHtml(message.displayText);
    this.shouldScroll = this.autoScroll;
    this.requestRender(true);

    this.activeTypingIntervalId = globalThis.setInterval(() => {
      if (!this.messages.includes(message)) {
        this.stopTypingAnimation();
        return;
      }

      if (index >= total) {
        return;
      }

      index = Math.min(total, index + charsPerTick);
      message.displayText = fullText.slice(0, index);
      message.html = this.markdownToSafeHtml(message.displayText);
      this.shouldScroll = this.autoScroll;
      this.requestRender(true);

      if (index >= total) {
        this.stopTypingAnimation();
        message.typing = false;
        message.displayText = undefined;
        message.html = this.markdownToSafeHtml(fullText);
        this.shouldScroll = this.autoScroll;
        this.requestRender(true);
      }
    }, intervalMs);
  }

  onChatScroll(): void {
    const el = this.chatScrollRef?.nativeElement;
    if (!el) {
      return;
    }

    const thresholdPx = 120;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const atBottom = distanceToBottom <= thresholdPx;

    const nextAutoScroll = atBottom;
    const nextShowButton = !atBottom && this.messages.length > 0;

    if (nextAutoScroll === this.autoScroll && nextShowButton === this.showScrollToBottomButton) {
      return;
    }

    this.autoScroll = nextAutoScroll;
    this.showScrollToBottomButton = nextShowButton;
    this.requestRender();
  }

  private clearPendingPromptTracking(): void {
    this.pendingPromptMessage = null;
    this.pendingPipelineId = null;
    this.pendingConversationId = null;
  }

  private tryAttachPromptHighlights(state: SecureFlowPipelineState): void {
    const pending = this.pendingPromptMessage;
    if (!pending) {
      return;
    }

    if (this.pendingConversationId && this.pendingConversationId !== this.conversationId) {
      return;
    }

    const pipelineId = state.pipelineId ?? null;
    if (!pipelineId) {
      return;
    }

    if (!this.pendingPipelineId) {
      this.pendingPipelineId = pipelineId;
    }

    if (this.pendingPipelineId !== pipelineId) {
      return;
    }

    if (!pending.segments) {
      const segments = this.buildPromptHighlightSegments(pending.content, state.sensitiveData);
      if (segments) {
        pending.segments = segments;
      }
    }

    if (!pending.promptPiiSummary) {
      const summary = this.buildPromptPiiSummary(state.sensitiveData);
      if (summary) {
        pending.promptPiiSummary = summary;
      }
    }

    if (state.stage === 'DONE' || state.stage === 'ERROR') {
      this.clearPendingPromptTracking();
    }
  }

  private buildPromptPiiSummary(sensitiveData: SensitiveDataItem[] | undefined): string | null {
    if (!sensitiveData?.length) {
      return null;
    }

    const promptItems = sensitiveData.filter((i) => this.isPromptSource(i.source));
    if (!promptItems.length) {
      return null;
    }

    const typeCounts = new Map<string, number>();
    for (const item of promptItems) {
      const t = (item.type ?? '').trim();
      if (!t) {
        continue;
      }
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }

    const parts = Array.from(typeCounts.entries())
      .sort((a, b) => {
        const countDiff = b[1] - a[1];
        if (countDiff !== 0) {
          return countDiff;
        }
        return a[0].localeCompare(b[0]);
      })
      .map(([type, count]) => (count > 1 ? `${type} (${count})` : type));

    if (!parts.length) {
      return null;
    }

    const total = promptItems.length;
    return `${total} item${total === 1 ? '' : 's'} — ${parts.join(', ')}`;
  }

  private buildPromptHighlightSegments(
    text: string,
    sensitiveData: SensitiveDataItem[] | undefined,
  ): ChatTextSegment[] | null {
    if (!text || !sensitiveData?.length) {
      return null;
    }

    const ranges = this.normalizePromptRanges(text, sensitiveData);
    if (!ranges.length) {
      return null;
    }

    const merged = this.mergeHighlightRanges(ranges);
    const segments = this.rangesToSegments(text, merged);

    // If something went wrong and we didn't actually split anything, skip segments.
    if (segments.length <= 1 && !segments.some((s) => s.piiLabel)) {
      return null;
    }

    return segments;
  }

  private normalizePromptRanges(
    text: string,
    sensitiveData: SensitiveDataItem[],
  ): Array<{ start: number; end: number; type: string }> {
    const promptItems = sensitiveData.filter((i) => this.isPromptSource(i.source));
    const ranges: Array<{ start: number; end: number; type: string }> = [];

    for (const item of promptItems) {
      const range = this.normalizeRangeFromItem(text, item);
      if (!range) {
        continue;
      }
      ranges.push({ ...range, type: item.type });
    }

    ranges.sort((a, b) => {
      const startDiff = a.start - b.start;
      if (startDiff !== 0) {
        return startDiff;
      }
      return a.end - b.end;
    });

    return ranges;
  }

  private mergeHighlightRanges(
    ranges: Array<{ start: number; end: number; type: string }>,
  ): Array<{ start: number; end: number; types: Set<string> }> {
    const merged: Array<{ start: number; end: number; types: Set<string> }> = [];

    for (const r of ranges) {
      const last = merged.at(-1);
      if (!last) {
        merged.push({ start: r.start, end: r.end, types: new Set([r.type]) });
        continue;
      }

      if (r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
        last.types.add(r.type);
        continue;
      }

      merged.push({ start: r.start, end: r.end, types: new Set([r.type]) });
    }

    return merged;
  }

  private rangesToSegments(
    text: string,
    merged: Array<{ start: number; end: number; types: Set<string> }>,
  ): ChatTextSegment[] {
    const segments: ChatTextSegment[] = [];
    let cursor = 0;

    for (const r of merged) {
      if (cursor < r.start) {
        segments.push({ text: text.slice(cursor, r.start) });
      }

      segments.push({ text: text.slice(r.start, r.end), piiLabel: Array.from(r.types).join(', ') });
      cursor = r.end;
    }

    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor) });
    }

    return segments.filter((s) => s.text.length > 0);
  }

  private isPromptSource(source: string): boolean {
    const s = (source ?? '').toLowerCase();
    return s === 'prompt' || s === 'userprompt' || s === 'user_prompt' || s.includes('prompt');
  }

  private normalizeRangeFromItem(
    text: string,
    item: Pick<SensitiveDataItem, 'start' | 'end' | 'value'>,
  ): { start: number; end: number } | null {
    const len = text.length;
    const rawStart = Number(item.start);
    const rawEnd = Number(item.end);

    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      return null;
    }

    const value = typeof item.value === 'string' ? item.value : '';
    const shouldTryMatch = value.length > 0 && value.length <= 256;

    const candidates: Array<{ start: number; end: number }> = [
      { start: rawStart, end: rawEnd },
      { start: rawStart, end: rawEnd + 1 },
      { start: rawStart - 1, end: rawEnd },
      { start: rawStart - 1, end: rawEnd + 1 },
    ];

    const clamp = (n: number): number => Math.min(len, Math.max(0, n));
    const asValid = (r: { start: number; end: number }): { start: number; end: number } | null => {
      const start = clamp(r.start);
      const end = clamp(r.end);
      return end > start ? { start, end } : null;
    };

    if (shouldTryMatch) {
      for (const c of candidates) {
        const valid = asValid(c);
        if (!valid) {
          continue;
        }
        if (text.slice(valid.start, valid.end) === value) {
          return valid;
        }
      }
    }

    return asValid({ start: rawStart, end: rawEnd });
  }

  private markdownToSafeHtml(markdown: string): SafeHtml {
    const raw = (marked.parse(markdown ?? '') as string) || '';
    const cleaned = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    return this.sanitizer.bypassSecurityTrustHtml(cleaned);
  }

  private ensureRenderedMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((m) => {
      if (m.role !== 'ai') {
        return m;
      }

      const normalized: ChatMessage = {
        ...m,
        typing: false,
        displayText: undefined,
      };

      normalized.html ??= this.markdownToSafeHtml(normalized.content);

      return normalized;
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom(false);
      this.shouldScroll = false;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0) ?? null;
    this.selectedFile = file;
    this.requestRender();
  }

  private httpErrorToUserMessage(err: HttpErrorResponse): string {
    switch (err.status) {
      case 0:
        return 'Unable to reach the server. Please check your connection and try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return err.status >= 500 && err.status <= 504
          ? 'Server error. Please try again in a moment.'
          : 'Request failed. Please try again.';
    }
  }

  private errorLikeMessage(err: unknown): string | null {
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const maybeMessage = (err as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        const trimmed = maybeMessage.trim();
        return trimmed || null;
      }
    }

    return null;
  }

  pipelineErrorText(): string | null {
    const err = this.pipelineError;
    if (!err) {
      return null;
    }

    if (err instanceof HttpErrorResponse) {
      return this.httpErrorToUserMessage(err);
    }

    if (err instanceof Error) {
      return err.message;
    }

    if (typeof err === 'string') {
      return err;
    }

    const message = this.errorLikeMessage(err);
    if (message) {
      return message;
    }

    return 'Something went wrong. Please try again.';
  }

  private createConversationId(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }

  private resetFileInput(): void {
    this.selectedFile = null;
    const el = this.fileInputRef?.nativeElement;
    if (el) {
      el.value = '';
    }
  }

  pipelineStatusText(): string {
    if (this.isConversationLoading) {
      return 'Starting conversation';
    }

    switch (this.pipelineStage) {
      case 'UPLOADING':
        return 'Uploading';
      case 'EXTRACTING':
        return 'Extracting text';
      case 'DETECTING':
        return 'Detecting sensitive data';
      case 'MASKING':
        return 'Masking sensitive data';
      case 'EXTERNAL_AI':
        return 'Generating response';
      case 'REHYDRATING':
        return 'Rehydrating response';
      case 'ERROR':
        return 'Error';
      case 'DONE':
        return 'Done';
      default:
        return 'Working';
    }
  }

  startNewConversation(): void {
    this.isConversationLoading = true;
    this.clearPendingPromptTracking();

    this.autoScroll = true;
    this.showScrollToBottomButton = false;

    this.requestRender();

    this.http.post<SessionResponse>(`${this.apiUrl}/chat/conversation`, {}).subscribe({
      next: (res: SessionResponse) => {
        this.conversationId = res.conversationId;
        this.activeConversationId = this.conversationId;
        this.messages = [];
        this.shouldScroll = true;
        this.router.navigate(['/chat', this.conversationId]);
        this.isConversationLoading = false;
        this.requestRender();
      },
      error: (err) => {
        console.error('Error creating conversation', err);

        // UX: if backend is down, still allow local navigation.
        const fallbackId = this.createConversationId();
        this.conversationId = fallbackId;
        this.activeConversationId = fallbackId;
        this.messages = [];
        this.shouldScroll = true;
        this.router.navigate(['/chat', fallbackId]);

        this.isConversationLoading = false;
        this.requestRender();
      },
    });
  }

  switchConversation(conv: ConversationSummary): void {
    this.clearPendingPromptTracking();
    this.messages = this.ensureRenderedMessages(conv.messages || []);
    this.conversationId = conv.conversationId;
    this.activeConversationId = conv.conversationId;

    this.autoScroll = true;
    this.showScrollToBottomButton = false;
    this.shouldScroll = true;
    this.router.navigate(['/chat', this.conversationId]);
  }

  sendMessage(): void {
    const text = this.userInput.trim();
    if (!text || this.isLoading) return;

    this.autoScroll = true;
    this.showScrollToBottomButton = false;

    const userMsg: ChatMessage = { role: 'user', content: text, time: this.getTime() };
    this.messages.push(userMsg);
    this.pendingPromptMessage = userMsg;
    this.pendingPipelineId = null;
    this.pendingConversationId = this.conversationId;
    this.userInput = '';
    this.shouldScroll = true;

    // Ensure the sent message renders immediately.
    this.requestRender();

    // Will be set from pipeline state once External AI responds.
    this.lastModelUsed = null;

    this.pipeline
      .startPipeline(text, this.selectedFile)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const aiText = res.finalText ?? '';
          const aiMsg: ChatMessage = {
            role: 'ai',
            content: aiText,
            html: this.markdownToSafeHtml(''),
            time: this.getTime(),
            model: this.lastModelUsed ?? undefined,
            warnings: res.warnings?.length ? res.warnings : undefined,
            typing: true,
            displayText: '',
          };
          this.messages.push(aiMsg);
          this.resetFileInput();
          this.shouldScroll = true;
          this.updateSidebar(text, aiText);
          this.allConversations.set(this.conversationId, [...this.messages]);
          this.startTypingAnimation(aiMsg);
          this.requestRender();
        },
        error: (err) => {
          console.error('Pipeline error:', err);
          const errMsg = this.pipelineErrorText() ?? 'Something went wrong. Please try again.';
          this.messages.push({
            role: 'ai',
            content: errMsg,
            html: this.markdownToSafeHtml(errMsg),
            time: this.getTime(),
            model: this.lastModelUsed ?? undefined,
          });
          this.resetFileInput();
          this.shouldScroll = true;
          this.requestRender();
        },
      });
  }

  private updateSidebar(userText: string, aiText: string): void {
    const preview = aiText.replaceAll(/\s+/g, ' ').trim();
    const existing = this.sidebarHistory.find((h) => h.conversationId === this.conversationId);
    if (existing) {
      existing.title = userText.substring(0, 30);
      existing.preview = preview.substring(0, 40);
      existing.messages = [...this.messages];
      existing.time = 'Now';
    } else {
      this.sidebarHistory.unshift({
        conversationId: this.conversationId,
        title: userText.substring(0, 30),
        preview: preview.substring(0, 40),
        messages: [...this.messages],
        time: 'Now',
      } satisfies ConversationSummary);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  scrollToBottom(smooth = true): void {
    const el = this.chatScrollRef?.nativeElement;
    if (!el) {
      return;
    }

    try {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    } catch {
      try {
        el.scrollTop = el.scrollHeight;
      } catch {}
    }

    this.autoScroll = true;
    this.showScrollToBottomButton = false;
    this.requestRender();
  }

  getTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
