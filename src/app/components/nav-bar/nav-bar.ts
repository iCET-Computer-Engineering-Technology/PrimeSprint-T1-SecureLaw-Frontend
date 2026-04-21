import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Token } from '../../core/services/token';
import { Theme } from '../../core/services/theme';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ChatSessionService } from '../../services/chat-session.service';

type NormalizedRole = 'SENIOR' | 'JUNIOR' | '';

@Component({
  selector: 'app-nav-bar',
  imports: [],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.css',
})
export class NavBar {
  private readonly router = inject(Router);
  private readonly token = inject(Token);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly theme = inject(Theme);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatSession = inject(ChatSessionService);

  readonly menuOpen = signal(false);
  readonly themeMenuOpen = signal(false);
  readonly currentUrl = signal<string>(this.router.url);

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.closeMenu();
      });
  }

  private normalizeRole(role: string | null | undefined): NormalizedRole {
    const normalized = (role ?? '').toString().trim().toUpperCase();
    if (normalized.startsWith('ROLE_')) {
      return normalized.slice('ROLE_'.length) as NormalizedRole;
    }
    return normalized as NormalizedRole;
  }

  get role(): NormalizedRole {
    return this.normalizeRole(this.token.getRole());
  }

  get canSeeAdmin(): boolean {
    return this.role === 'SENIOR';
  }

  get isDark(): boolean {
    return this.theme.mode() === 'dark';
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  openThemeMenu(): void {
    this.themeMenuOpen.set(true);
  }

  closeThemeMenu(): void {
    this.themeMenuOpen.set(false);
  }

  setTheme(mode: 'light' | 'dark'): void {
    this.theme.setMode(mode);
    this.closeMenu();
  }

  isActive(path: string): boolean {
    const url = this.currentUrl();
    return url === path || url.startsWith(`${path}/`);
  }

  toggleMenu(): void {
    this.menuOpen.set(!this.menuOpen());
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    this.themeMenuOpen.set(false);
  }

  goToUserManagement(): void {
    this.closeMenu();
    this.router.navigate(['/admin/user-management']);
  }

  goToChat(): void {
    this.closeMenu();

    this.chatSession.createChat().subscribe({
      next: (session) => {
        this.router.navigate(['/chat', session.chatId]);
      },
      error: (err) => {
        console.error('Failed to create chat session from navbar:', err);
      },
    });
  }

  goToAuditLogs(): void {
    this.closeMenu();
    this.router.navigate(['/admin/audit-logs']);
  }

  logout(): void {
    this.closeMenu();
    this.token.clear();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) {
      return;
    }

    const target = event.target as Node | null;
    if (!target) {
      return;
    }

    const clickedInside = this.hostEl.nativeElement.contains(target);
    if (!clickedInside) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
