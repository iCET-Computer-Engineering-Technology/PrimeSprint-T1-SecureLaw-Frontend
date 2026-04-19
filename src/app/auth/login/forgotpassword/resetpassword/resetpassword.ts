import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

const passwordsMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('newPassword')?.value as string;
  const confirmPassword = control.get('confirmPassword')?.value as string;

  if (!password || !confirmPassword) {
    return null;
  }

  return password === confirmPassword ? null : { passwordMismatch: true };
};
@Component({
  selector: 'app-resetpassword',
  imports: [ReactiveFormsModule,RouterLink],
  templateUrl: './resetpassword.html',
  styleUrl: './resetpassword.css',
})
export class Resetpassword {
  private readonly http = inject(HttpClient);
  private readonly formBuilder = inject(FormBuilder);
  private readonly emailFromQuery = signal('');
  private readonly tokenFromQuery = signal('');

  readonly isLoading = signal(false);
  readonly passwordChanged = signal(false);
  readonly apiError = signal('');

  readonly resetForm = this.formBuilder.group(
    {
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  readonly displayedEmail = computed(() => {
    const email = this.emailFromQuery();
    return email || 'No email provided';
  });

  readonly hasToken = computed(() => this.tokenFromQuery().length > 0);

  constructor() {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    const email = params.get('email') ?? '';
    const token = params.get('token') ?? '';

    this.emailFromQuery.set(email);
    this.tokenFromQuery.set(token);
    this.resetForm.get('email')?.setValue(email);
  }

  changePassword(): void {
    this.apiError.set('');
    this.passwordChanged.set(false);

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const reqId = this.tokenFromQuery();
    if (!reqId) {
      this.apiError.set('Reset token is missing from the URL. Please open the reset link from your email again.');
      return;
    }

    const password = this.resetForm.get('newPassword')?.value as string;
    const url = `http://localhost:8080/api/reset-password?reqId=${encodeURIComponent(reqId)}&password=${encodeURIComponent(password)}`;

    this.isLoading.set(true);

    this.http.post(url, null).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.passwordChanged.set(true);
        this.resetForm.patchValue({
          newPassword: '',
          confirmPassword: '',
        });
        this.resetForm.markAsPristine();
        this.resetForm.markAsUntouched();
      },
      error: () => {
        this.isLoading.set(false);
        this.apiError.set('Unable to reset password. The token may be invalid or expired.');
      },
    });
  }
}
