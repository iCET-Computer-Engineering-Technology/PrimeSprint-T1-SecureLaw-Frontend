import { NgZone, Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { NavBar } from '../../../components/nav-bar/nav-bar';
import { AuditLogService} from '../../../services/audit-log';
import { AuditLog } from '../../../models/audit-log';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType, Chart, registerables } from 'chart.js';
Chart.register(...registerables);

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, NavBar, DatePipe, FormsModule, BaseChartDirective],
  templateUrl: './audit-log.html',
  styleUrls: ['./audit-log.css'],
})
export class AuditLogComponent implements OnInit {

  public piiChartData: ChartData<'line'> = {
    labels: [],
    datasets: []
  };

  public piiChartOptions: ChartOptions<'line'> = {
    responsive: true
  };

  public piiChartType: ChartType = 'line';

  filters = {
    userId: '',
    fromDate: '',
    toDate: ''
  };

  auditLogs: AuditLog[] = [];
  loading = false;
  error = '';

  constructor(
    private auditLogService: AuditLogService,
    private cdr: ChangeDetectorRef
  ) {}
  ngOnInit(): void {
    // Load audit logs once on init
    this.loadAuditLogs();
    this.loadPiiChart();
  }

  loadAuditLogs(): void {
    this.loading = true;

    this.auditLogService.getAuditLogs().subscribe({
      next: (data) => {
        this.auditLogs = data;
        this.loading = false;

        this.cdr.markForCheck();   // ✅ KEY FIX
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cdr.markForCheck();   // also here
      }
    });
  }

  currentPage = 1;
  pageSize = 10;

  get paginatedLogs() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.auditLogs.slice(start, start + this.pageSize);
  }

  get totalPages() {
    return Math.ceil(this.auditLogs.length / this.pageSize);
  }

  loadPiiChart() {
    this.auditLogService.getPiiStats().subscribe({
      next: (data: any[]) => {

        data.sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

        this.piiChartData = {
          labels: data.map(d => d.day),
          datasets: [
            {
              data: data.map(d => d.totalBlocked),
              label: 'PII Masked'
            }
          ]
        };
      
        this.cdr.markForCheck();
      },
      error: (err) => console.error(err)
    });
  }

  getMaskKeys(maskCounts: any): string[] {
    return maskCounts ? Object.keys(maskCounts) : [];
  }

  selectedLog: AuditLog | null = null;

  openLog(log: AuditLog) {
    this.selectedLog = log;
  }

  downloadCSV() {
    this.auditLogService.exportLogs().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit_logs.csv'; // filename

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      error: (err) => {
        console.error('Export failed', err);
      }
    });
  }

  // MAIN FILTER FUNCTION
  applyFilters() {
    console.log('Filter clicked'); 
    const { userId, fromDate, toDate } = this.filters;

    this.loading = true;

    // CASE 1: userId + date range
    if (userId && fromDate && toDate) {
      console.log('In case 1'); 
      this.auditLogService.getByDateAndUser(userId, fromDate, toDate)
        .subscribe({
          next: (res) => {
            this.auditLogs = res;
            console.log('API DATA id and date:', res);
            this.loading = false;
            this.cdr.markForCheck(); 
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });

        console.log('End of case 1'); 
    }

    // CASE 2: only userId
    else if (userId) {
      console.log('In case 2'); 
      this.auditLogService.getByUserId(userId)
        .subscribe({
          next: (res) => {
            this.auditLogs = res;
            console.log('API DATA id only:', res);
            this.loading = false;
            this.cdr.markForCheck(); 
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });
        console.log('End of case 2'); 
    }

    // CASE 3: only date range
    else if (fromDate && toDate) {
      console.log('In case 3'); 
      this.auditLogService.getByDate(fromDate, toDate)
        .subscribe({
          next: (res) => {
            this.auditLogs = res;
            console.log('API DATA fromTodate:', res);
            this.loading = false;
            this.cdr.markForCheck(); 
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });
      console.log('End of case 3'); 
    }

    // CASE 4: no filters
    else {
      console.log('In else'); 
      this.loadAuditLogs();
      this.cdr.markForCheck(); 
    }
  }

  // RESET
  resetFilters() {
    this.filters = {
      userId: '',
      fromDate: '',
      toDate: ''
    };

    this.loadAuditLogs();


  }





  

}



