import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

interface AuthDto {
  email: string;
  newPassword: string;
}

@Component({
  selector: 'app-forgotpassword',
  templateUrl: './forgotpassword.html',
  styleUrl: './forgotpassword.css',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  standalone: true,
})
export class Forgotpassword {
  
}