import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
 
}