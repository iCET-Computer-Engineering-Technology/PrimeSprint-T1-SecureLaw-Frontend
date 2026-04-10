import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../services/user.service';

interface AuthDto {
  email: string;
  newPassword: string;
}

@Component({
  selector: 'app-forgotpassword',
  templateUrl: './forgotpassword.html',
  styleUrl: './forgotpassword.css',
  imports: [CommonModule, FormsModule,RouterLink],
  standalone: true,
}) 

export class Forgotpassword {
 
  private baseUrl = 'http://localhost:8080/api/auth';

  constructor(private http: HttpClient) {}  

  authDto: AuthDto = {
    email: '',
    newPassword: ''
  };

  forgotPassword() {
    this.http.post(`${this.baseUrl}/forgot-password`, this.authDto).subscribe(
      response => {
        console.log('Password reset successful', response);
        alert('Password reset successful. Please check your email for further instructions.');
      },
      error => {
        console.error('Error resetting password', error);
        alert('Error resetting password. Please try again later.');
      }
    );  

  }
 
 
}