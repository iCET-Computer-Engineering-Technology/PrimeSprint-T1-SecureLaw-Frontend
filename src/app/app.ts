import { Component, OnInit, signal } from '@angular/core';
import { HealthService } from './services/health';
import { environment } from '../environments/environment';
import { RouterOutlet } from '@angular/router';
import { Connectivity } from './core/services/connectivity';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('SecureLaw');

  constructor(
    private readonly healthService: HealthService,
    protected readonly connectivity: Connectivity,
  ) {}

  ngOnInit(): void {
    console.log(`Backend URL :${environment.apiUrl}`);

    this.healthService.checkBackend().subscribe({
      next: (res) => console.log('Backend is UP', res),
      error: (err) => console.error('Backend is DOWN', err),
    });
  }
}
