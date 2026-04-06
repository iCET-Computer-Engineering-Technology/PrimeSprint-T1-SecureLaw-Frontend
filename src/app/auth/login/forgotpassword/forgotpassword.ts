import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forgotpassword',
  templateUrl: './forgotpassword.html',
  styleUrl: './forgotpassword.css',
  imports: [CommonModule, FormsModule,RouterLink],
  standalone: true,
})
export class Forgotpassword {
  email = '';
  newPassword = '';
  confirmPassword = '';
  message = '';
  messageType: 'success' | 'error' | '' = '';
  loading = false;
  showSuccessModal = false;

  private baseUrl = 'http://localhost:8080/api/auth';

  constructor(private http: HttpClient) {}  

  onSubmit() {
    if (!this.email || !this.newPassword || !this.confirmPassword) {
      this.showMessage('Please fill in all fields.', 'error');
      return;
    }
   
    if (this.newPassword !== this.confirmPassword) {
      this.showMessage('Passwords do not match.', 'error');
      return;
    }

    this.loading = true;
    this.resetPassword({ email: this.email, newPassword: this.newPassword }).subscribe({
      next: () => {
        this.showSuccessModal = true;
        this.email = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: () => {
        this.showMessage('Failed to reset password. Please try again.', 'error');
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  resetPassword(data: any) {
    return this.http.post(`${this.baseUrl}/users/reset-password`, data);
  }

  showMessage(msg: string, type: 'success' | 'error') {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => {
      this.message = '';
      this.messageType = '';
    }, 4000);
  }

  closeModal() {
    this.showSuccessModal = false;
  }
}