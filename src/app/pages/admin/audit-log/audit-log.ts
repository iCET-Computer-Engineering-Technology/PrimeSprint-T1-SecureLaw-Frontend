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

  }

  loadAuditLogs(): void {
    this.loading = true;

    this.auditLogService.getAuditLogs().subscribe({
      next: (data) => {
        this.applyData(data); // updates both table + chart
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cdr.markForCheck(); 
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

  getMaskKeys(maskCounts: any): string[] {
    return maskCounts ? Object.keys(maskCounts) : [];
  }

  downloadCSV() {
    this.auditLogService.exportLogs().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit_logs.csv'; 

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      error: (err) => {
        console.error('Export failed', err);
      }
    });
  }

  isValidDate(date: string): boolean {
    return !!date && !isNaN(new Date(date).getTime());
  }

  isSingleDateSearch(): boolean {
    return (!!this.filters.fromDate && !this.filters.toDate) ||
          (!this.filters.fromDate && !!this.filters.toDate);
  }

  // Filter Function
  applyFilters() {
    console.log('Filter clicked'); 
    const { userId, fromDate, toDate } = this.filters;

    if ((fromDate && !this.isValidDate(fromDate)) ||
      (toDate && !this.isValidDate(toDate))) {
      this.error = 'Invalid date format';
      return;
    }

    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      this.error = 'From date cannot be after To date';
      return;
    }

    this.error = '';

    this.loading = true;

    // CASE 1: UserId + date range
    if (userId && fromDate && toDate) {
      console.log('In case 1'); 
      this.auditLogService.getByDateAndUser(userId, fromDate, toDate)
        .subscribe({
          next: (res) => {
            this.applyData(res);
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });

        console.log('End of case 1'); 
    }

    // CASE 2: Only userId
    else if (userId) {
      console.log('In case 2'); 
      this.auditLogService.getByUserId(userId)
        .subscribe({
          next: (res) => {
            this.applyData(res);
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });
        
        console.log('End of case 2'); 
    }

    // Case 3A: Only ONE date entered
    else if (this.isSingleDateSearch()) {
      const date = fromDate || toDate;

      this.auditLogService.getByDate(date, date)
        .subscribe({
          next: (res) => this.applyData(res),
          error: (err) => {
            console.error(err);
            this.loading = false;
          }
        });
    }

    // CASE 3B: Only date range
    else if (fromDate && toDate) {
      console.log('In case 3'); 
      this.auditLogService.getByDate(fromDate, toDate)
        .subscribe({
          next: (res) => {
            this.applyData(res);  
          },
          error: (err) => {
            console.error('API ERROR:', err); 
            this.loading = false;
            this.cdr.markForCheck(); 
          }
        });
        
      console.log('End of case 3'); 
    }

    // CASE 4: No filters
    else {
      console.log('In else'); 
      this.loadAuditLogs();
      this.cdr.markForCheck(); 
    }
  }

  // Reset Function
  resetFilters() {
    this.filters = {
      userId: '',
      fromDate: '',
      toDate: ''
    };

    this.currentPage = 1;

    this.auditLogService.getAuditLogs().subscribe(res => {
      this.applyData(res);
    });
  }

  selectedLog: AuditLog | null = null;

  openLog(log: AuditLog) {
    this.selectedLog = log;
  }

  closeModal() {
    this.selectedLog = null;
  }

  private applyData(logs: AuditLog[]) {
    this.auditLogs = logs;
    this.loadPiiChartFromLogs(logs);

    this.loading = false;
    this.cdr.markForCheck();
  }

  loadPiiChartFromLogs(logs: AuditLog[]) {

    const grouped: { [date: string]: number } = {};

    logs.forEach(log => {
      const date = new Date(log.timestamp).toISOString().split('T')[0];

      const count = log.maskCounts
        ? Object.values(log.maskCounts).reduce((a: any, b: any) => a + b, 0)
        : 0;

      grouped[date] = (grouped[date] || 0) + count;
    });

    const labels = Object.keys(grouped).sort();
    const data = labels.map(d => grouped[d]);

    this.piiChartData = {
      labels,
      datasets: [
        {
          label: 'PII Masked',
          data,
          tension: 0.3
        }
      ]
    };
  }


  loadPiiChart() {
    this.auditLogService.getPiiStats().subscribe({
      next: (data) => {

        data.sort((a, b) =>
          new Date(a.day).getTime() - new Date(b.day).getTime()
        );

        const finalData = data.slice(-7); // default view

        this.piiChartData = {
          labels: finalData.map(d => d.day),
          datasets: [
            {
              label: 'PII Masked',
              data: finalData.map(d => d.totalBlocked),
              tension: 0.3
            }
          ]
        };
      }
    });
  }

}



