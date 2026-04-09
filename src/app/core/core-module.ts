import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropZoneDirective } from '../pages/chat/DropZoneDirective';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    DropZoneDirective
  ],
  exports: [
    DropZoneDirective
  ]
})
export class CoreModule { }
