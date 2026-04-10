import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly http = inject(HttpClient);
  private readonly formBuilder = inject(FormBuilder);

  readonly mailSent = signal(false);
  readonly isLoading = signal(false);
  readonly resetForm: FormGroup = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });

  sendResetEmail(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const email = this.resetForm.get('email')?.value as string;

    const url = `http://localhost:8080/api/send-password-reset-email?email=${encodeURIComponent(email)}`;

    this.http.post(url, null).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.mailSent.set(true);
        this.resetForm.reset();
        setTimeout(() => {
          this.mailSent.set(false);
        }, 4000);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }
}
